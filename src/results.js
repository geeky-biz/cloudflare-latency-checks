const fs = require('fs');
const path = require('path');

// Read and parse the measurements.jsonl file
function readMeasurements() {
  const filePath = path.join(__dirname, 'measurements.jsonl');
  
  if (!fs.existsSync(filePath)) {
    console.error('Error: measurements.jsonl file not found');
    process.exit(1);
  }

  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.trim().split('\n').filter(line => line.trim());
  
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (error) {
      console.warn('Warning: Skipping invalid JSON line:', line);
      return null;
    }
  }).filter(record => record !== null);
}

// Calculate statistics for tcp_connect_time by URL
function calculateStats(measurements) {
  const urlStats = {};
  
  measurements.forEach(measurement => {
    const { url, tcp_connect_time } = measurement;
    
    if (tcp_connect_time === null || tcp_connect_time === undefined) {
      return; // Skip measurements without tcp_connect_time
    }
    
    if (!urlStats[url]) {
      urlStats[url] = [];
    }
    
    urlStats[url].push(tcp_connect_time);
  });
  
  const results = [];
  
  Object.entries(urlStats).forEach(([url, times]) => {
    if (times.length === 0) return;
    
    const average = times.reduce((sum, time) => sum + time, 0) / times.length;
    
    // Calculate standard deviation
    const variance = times.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);
    
    results.push({
      url,
      average: parseFloat((average * 1000).toFixed(0)), // Convert to milliseconds
      standardDeviation: parseFloat(((standardDeviation / average) * 100).toFixed(2)), // Convert to percentage
      count: times.length
    });
  });
  
  return results.sort((a, b) => b.average - a.average); // Sort by average (highest to lowest)
}

// Display results in tabular format
function displayTable(results) {
  console.log('\nTCP Connect Time Statistics by URL');
  console.log('=' .repeat(80));
  console.log('URL'.padEnd(50) + 'Average (ms)'.padStart(12) + 'Std Dev (%)'.padStart(12) + 'Count'.padStart(8));
  console.log('-'.repeat(80));
  
  results.forEach(result => {
    const url = result.url.length > 47 ? result.url.substring(0, 44) + '...' : result.url;
    console.log(
      url.padEnd(50) + 
      result.average.toFixed(0).padStart(12) + 
      result.standardDeviation.toFixed(2).padStart(12) + 
      result.count.toString().padStart(8)
    );
  });
  
  console.log('-'.repeat(80));
  console.log(`Total URLs: ${results.length}`);
  console.log('=' .repeat(80));
}

// Write results to CSV file
function writeCSV(results, outputPath) {
  const csvContent = [
    'URL,Average (ms),Standard Deviation (%),Count',
    ...results.map(result => `${result.url},${result.average},${result.standardDeviation},${result.count}`)
  ].join('\n');
  
  fs.writeFileSync(outputPath, csvContent);
  console.log(`\nResults written to: ${outputPath}`);
}

// Main function
function main() {
  try {
    console.log('Reading measurements from measurements.jsonl...');
    const measurements = readMeasurements();
    
    if (measurements.length === 0) {
      console.log('No valid measurements found in the file.');
      return;
    }
    
    console.log(`Found ${measurements.length} measurements`);
    
    const results = calculateStats(measurements);
    
    if (results.length === 0) {
      console.log('No measurements with valid tcp_connect_time found.');
      return;
    }
    
    // Display table
    displayTable(results);
    
    // Write CSV
    const csvPath = path.join(__dirname, 'measurements.csv');
    writeCSV(results, csvPath);
    
  } catch (error) {
    console.error('Error processing measurements:', error.message);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = { readMeasurements, calculateStats, displayTable, writeCSV };
