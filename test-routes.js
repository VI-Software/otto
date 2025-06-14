#!/usr/bin/env node

/**
 * Quick test to verify chunked upload routes are working
 */

import fetch from 'node-fetch';

const SERVER_URL = process.env.OTTO_URL || 'http://localhost:3000';
const SERVICE_TOKEN = process.env.OTTO_SERVICE_TOKEN || 'your-service-token-here';

async function testRoutes() {
  console.log('🧪 Testing Otto Chunked Upload Routes');
  console.log(`Server: ${SERVER_URL}`);
  
  try {
    // Test 1: Get configuration
    console.log('\n1. Testing GET /upload/chunk/config');
    const configResponse = await fetch(`${SERVER_URL}/upload/chunk/config`);
    console.log(`   Status: ${configResponse.status}`);
    
    if (configResponse.ok) {
      const config = await configResponse.json();
      console.log(`   ✅ Config retrieved: chunk size = ${config.data.formattedChunkSize}`);
    } else {
      console.log(`   ❌ Failed to get config`);
      return;
    }

    // Test 2: Initialize session
    console.log('\n2. Testing POST /upload/chunk/init');
    const initResponse = await fetch(`${SERVER_URL}/upload/chunk/init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        originalFilename: 'test.txt',
        totalSize: 1024,
        mimeType: 'text/plain',
        context: 'test'
      })
    });
    
    console.log(`   Status: ${initResponse.status}`);
    
    if (initResponse.ok) {
      const initData = await initResponse.json();
      const sessionId = initData.data.sessionId;
      console.log(`   ✅ Session initialized: ${sessionId}`);
      
      // Test 3: Get session status
      console.log('\n3. Testing GET /upload/chunk/:sessionId/status');
      const statusResponse = await fetch(`${SERVER_URL}/upload/chunk/${sessionId}/status`, {
        headers: {
          'Authorization': `Bearer ${SERVICE_TOKEN}`
        }
      });
      
      console.log(`   Status: ${statusResponse.status}`);
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log(`   ✅ Status retrieved: ${statusData.data.uploadedChunks}/${statusData.data.totalChunks} chunks`);
      } else {
        const statusError = await statusResponse.text();
        console.log(`   ❌ Status failed: ${statusError}`);
      }
      
      // Test 4: Try to complete upload (should fail - no chunks uploaded)
      console.log('\n4. Testing POST /upload/chunk/:sessionId/complete');
      const completeResponse = await fetch(`${SERVER_URL}/upload/chunk/${sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_TOKEN}`
        }
      });
      
      console.log(`   Status: ${completeResponse.status}`);
      
      if (completeResponse.ok) {
        console.log(`   ⚠️  Complete succeeded (unexpected - no chunks uploaded)`);
      } else {
        const completeError = await completeResponse.text();
        console.log(`   ✅ Complete failed as expected: ${JSON.parse(completeError).error}`);
      }
      
      // Test 5: Cancel session
      console.log('\n5. Testing DELETE /upload/chunk/:sessionId');
      const cancelResponse = await fetch(`${SERVER_URL}/upload/chunk/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${SERVICE_TOKEN}`
        }
      });
      
      console.log(`   Status: ${cancelResponse.status}`);
      
      if (cancelResponse.ok) {
        console.log(`   ✅ Session cancelled successfully`);
      } else {
        const cancelError = await cancelResponse.text();
        console.log(`   ❌ Cancel failed: ${cancelError}`);
      }
      
    } else {
      const initError = await initResponse.text();
      console.log(`   ❌ Init failed: ${initError}`);
      return;
    }

    console.log('\n🎉 All route tests completed!');
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

// Run tests
testRoutes().catch(console.error);
