const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const CONFIG = {
  urls: [
    // Replace these placeholders with your 12 URLs
    "https://playbooks.com/cdn-cgi/trace?load=0",
    "https://remoteok.com/cdn-cgi/trace?load=0",
    "https://judge2020.com/cdn-cgi/trace?load=0",
    "https://superblog.ai/cdn-cgi/trace?load=0",
    "https://www.jsdelivr.com/cdn-cgi/trace?load=0",
    "https://cdnjs.com/cdn-cgi/trace?load=0",
    "https://unwomen.org.au/cdn-cgi/trace?load=0",
    "https://www.thetrevorproject.org/cdn-cgi/trace?load=0",
    "https://decisiondeskhq.com/cdn-cgi/trace?load=0",
    "https://support.wiki.gg/cdn-cgi/trace?load=0",
    "https://www.ndis.gov.au/cdn-cgi/trace?load=0",
    "https://www.canva.com/cdn-cgi/trace?load=0",
    "https://punits.dev",
    "https://www.crawlably.com",
    "https://www.elegantdecor.co.in/"
  ],
  headersToCapture: [
    "cf-ray"
  ],
  outputFile: path.resolve(__dirname, 'measurements.jsonl'),
  curlTimeoutSeconds: 15,
  followRedirects: false,
  method: 'GET',
  concurrency: 15
};

function runCurl(url) {
  return new Promise((resolve) => {
    const format = 'CURLMETRICS:time_namelookup=%{time_namelookup};time_connect=%{time_connect};time_appconnect=%{time_appconnect};remote_ip=%{remote_ip};http_code=%{http_code}\\n';
    const args = [];
    if (CONFIG.followRedirects) args.push('-L');
    // Use GET + -D - + -o /dev/null to capture the final response headers only, while discarding body
    args.push('-sS', '-D', '-', '-o', '/dev/null', '--max-time', String(CONFIG.curlTimeoutSeconds), '-w', format, url);

    execFile('curl', args, { timeout: CONFIG.curlTimeoutSeconds * 1000 }, async (err, stdout, stderr) => {
      const ts = new Date().toISOString();

      // If stdout exists, parse metrics and headers
      let measurement = {
        timestamp: ts,
        url,
        remote_ip: null,
        http_code: null,
        time_namelookup: null,
        time_connect: null,
        time_appconnect: null,
        tcp_connect_time: null,
        headers: {}
      };

      try {
        // Look for the metrics footer we requested
        const metricIdx = stdout ? stdout.lastIndexOf('CURLMETRICS:') : -1;
        let headerPart = stdout;
        let metricLine = '';

        if (metricIdx >= 0) {
          headerPart = stdout.slice(0, metricIdx).trim();
          metricLine = stdout.slice(metricIdx).split(/\r?\n/)[0];
          const m = metricLine.match(/time_namelookup=([\d.]+);time_connect=([\d.]+);time_appconnect=([\d.]+);remote_ip=([^;]*);http_code=(\d+)/);
          if (m) {
            const [ , time_namelookup, time_connect, time_appconnect, remote_ip, http_code ] = m;
            measurement.time_namelookup = parseFloat(time_namelookup);
            measurement.time_connect = parseFloat(time_connect);
            measurement.time_appconnect = parseFloat(time_appconnect);
            measurement.remote_ip = remote_ip || null;
            measurement.http_code = parseInt(http_code, 10) || null;
            // TCP handshake time (exclude DNS cost)
            measurement.tcp_connect_time = (measurement.time_connect != null && measurement.time_namelookup != null)
              ? Math.max(0, measurement.time_connect - measurement.time_namelookup)
              : null;
          }
        } else {
          // If no metrics found, try to salvage stderr (curl error)
        }

        // Parse the last header block (handles redirects: take final block)
        const blocks = headerPart.split(/\r?\n\r?\n/).filter(Boolean);
        const lastHeaderBlock = blocks.length ? blocks[blocks.length - 1] : headerPart;
        const headerLines = lastHeaderBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        // Create case-insensitive map of headers (lowercased keys)
        const headerMap = {};
        for (const line of headerLines) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const k = line.slice(0, idx).trim().toLowerCase();
            const v = line.slice(idx + 1).trim();
            if (k in headerMap) headerMap[k] += `, ${v}`;
            else headerMap[k] = v;
          }
        }

        // Fill requested headers (case-insensitive)
        for (const want of CONFIG.headersToCapture) {
          const lk = want.toLowerCase();
          measurement.headers[want] = headerMap[lk] ?? null;
        }

        if (err && !metricIdx) {
          // Curl failed and we have no metric footer — include error
          measurement.error = err.message;
        }
      } catch (parseErr) {
        measurement.error = parseErr.message;
      }

      resolve(measurement);
    });
  });
}

async function appendRecord(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(obj) + '\n');
}

async function runAll() {
  const out = CONFIG.outputFile;
  const urls = CONFIG.urls.slice();
  const concurrency = Math.max(1, CONFIG.concurrency || 1);
  const running = [];
  while (urls.length) {
    if (running.length >= concurrency) {
      await Promise.race(running);
      // remove finished promises
      for (let i = running.length - 1; i >= 0; i--) {
        if (running[i].isFulfilled) running.splice(i, 1);
      }
    } else {
      const url = urls.shift();
      const p = (async () => {
        const m = await runCurl(url);
        await appendRecord(out, m);
        console.log(new Date().toISOString(), url, '->', m.tcp_connect_time != null ? `${m.tcp_connect_time}s` : 'ERR', m.remote_ip || '', m.http_code || '');
      })();
      // small wrapper to allow checking finished status
      p.isFulfilled = false;
      p.then(() => p.isFulfilled = true, () => p.isFulfilled = true);
      running.push(p);
    }
  }
  // wait for remaining
  await Promise.all(running);
  console.log('All done — results appended to', out);
}

if (require.main === module) {
  runAll().catch(err => {
    console.error('Fatal collector error:', err);
    process.exit(1);
  });
}
