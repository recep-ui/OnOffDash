const fs = require('fs');
const path = require('path');

async function runTest() {
  try {
    const filePath = path.join(__dirname, '../test_envanter.xlsx');
    console.log(`📖 Reading test Excel file from: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Error: test_envanter.xlsx does not exist at ${filePath}`);
      process.exit(1);
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    console.log(`📦 File encoded to base64. Size: ${base64Data.length} chars.`);
    
    console.log('🚀 Sending POST request to http://localhost:3001/api/devices/import...');
    const response = await fetch('http://localhost:3001/api/devices/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileData: base64Data })
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

runTest();
