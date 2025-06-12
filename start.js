#!/usr/bin/env node

import dotenv from 'dotenv';
import database from './src/config/database.js';

// Load environment variables
dotenv.config();

console.log('🚀 Otto Server - Pre-flight Check');
console.log('=====================================');

// Check required environment variables
const requiredEnvVars = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'JWT_SECRET',
  'SERVICE_TOKEN'
];

let missingVars = [];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    missingVars.push(envVar);
  }
}

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nPlease check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Test database connection
console.log('🔍 Testing database connection...');
try {
  const result = await database.query('SELECT NOW() as current_time');
  console.log('✅ Database connection successful');
  console.log(`   Connected to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
} catch (error) {
  console.error('❌ Database connection failed:', error.message);
  console.error('   The server will start but database features will not work.');
  console.error('   Please check your database configuration and ensure PostgreSQL is running.');
}

console.log('✅ Environment variables OK');

// Test imports
try {
  const logger = await import('./src/config/logger.js');
  console.log('✅ Logger module OK');
  
  const database = await import('./src/config/database.js');
  console.log('✅ Database module OK');
  
  // Test database connection
  try {
    await database.default.testConnection();
    console.log('✅ Database connection OK');
  } catch (error) {
    console.warn('⚠️  Database connection failed:', error.message);
    console.warn('   The server will start but database operations will fail.');
    console.warn('   Please ensure PostgreSQL is running and credentials are correct.');
  }
  
  console.log('✅ All checks passed');
  console.log('\n🚀 Starting Otto server...\n');
  
  // Import and start the server
  await import('./src/server.js');
  
} catch (error) {
  console.error('❌ Startup failed:', error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('\nFull error:', error);
  }
  process.exit(1);
}
