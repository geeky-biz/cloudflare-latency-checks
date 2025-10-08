## About this script
A simple script to check latency to a provided FQDN:
- One or more Urls can be added to `src/measure.js`
- For one off run, the script can be run via `node src/measure.js`
- To schedule multiple runs, use crontab like the following:

```
*/30 * * * * node /opt/cloudflare-latency-checks/src/measure.js >> /opt/cloudflare-latency-checks/run.log 2>&1
```
- Once the runs are executed for the needed number of times, the results can be consolidated via `node src/results.js`

## How is the latency measured:
- The script executes the following curl command:
```
curl -sS -D - -o /dev/null --max-time 15 -w 'CURLMETRICS:time_namelookup=%{time_namelookup};time_connect=%{time_connect};time_appconnect=%{time_appconnect};remote_ip=%{remote_ip};http_code=%{http_code}\n' "<URL>"
```
- The latency is measured via `time_connect - time_namelookup` from the above run.

## Results:
This script was created and executed for the findings published in the blog post [Think Cloudflare Always Speeds You Up? Not in India](https://punits.dev/blog/cloudflare-latency-india/).