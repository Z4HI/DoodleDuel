#!/usr/bin/env node

/**
 * Universal Supabase Migration Runner
 * 
 * Usage:
 *   node run-migration.js <migration-file>
 *   node run-migration.js SUPABASE/migrations/fix_roulette_rls_and_realtime.sql
 *   
 * Environment variables:
 *   SUPABASE_SERVICE_KEY - Required. Your Supabase service role key
 *   SUPABASE_URL - Optional. Defaults to project URL
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://qxqduzzqcivosdauqpis.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment
if (!supabaseServiceKey) {
  console.error('\n❌ SUPABASE_SERVICE_KEY environment variable is required\n');
  console.log('💡 Get your service key from: https://supabase.com/dashboard/project/_/settings/api\n');
  console.log('Usage:');
  console.log('  export SUPABASE_SERVICE_KEY=your-service-key');
  console.log('  node run-migration.js <migration-file>\n');
  console.log('Example:');
  console.log('  node run-migration.js SUPABASE/migrations/fix_roulette_rls_and_realtime.sql\n');
  process.exit(1);
}

// Validate arguments
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('\n❌ Migration file argument required\n');
  console.log('Usage:');
  console.log('  node run-migration.js <migration-file>\n');
  console.log('Examples:');
  console.log('  node run-migration.js SUPABASE/migrations/fix_roulette_rls_and_realtime.sql');
  console.log('  node run-migration.js add-profiles-foreign-key.sql\n');
  process.exit(1);
}

// Resolve migration file path
let migrationPath;
if (path.isAbsolute(migrationFile)) {
  migrationPath = migrationFile;
} else if (fs.existsSync(migrationFile)) {
  migrationPath = path.resolve(migrationFile);
} else if (fs.existsSync(path.join(__dirname, migrationFile))) {
  migrationPath = path.join(__dirname, migrationFile);
} else if (fs.existsSync(path.join(__dirname, 'SUPABASE', 'migrations', migrationFile))) {
  migrationPath = path.join(__dirname, 'SUPABASE', 'migrations', migrationFile);
} else {
  console.error(`\n❌ Migration file not found: ${migrationFile}\n`);
  console.log('Searched in:');
  console.log(`  - ${path.resolve(migrationFile)}`);
  console.log(`  - ${path.join(__dirname, migrationFile)}`);
  console.log(`  - ${path.join(__dirname, 'SUPABASE', 'migrations', migrationFile)}\n`);
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('\n🚀 Running migration...\n');
  console.log(`📄 File: ${migrationPath}`);
  console.log(`🔗 URL:  ${supabaseUrl}\n`);

  try {
    // Read migration file
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    if (!migrationSQL.trim()) {
      console.error('❌ Migration file is empty');
      process.exit(1);
    }

    console.log('🔧 Executing SQL...\n');

    // Try to execute via RPC (if exec_sql function exists)
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_string: migrationSQL
    });

    if (error) {
      // If exec_sql doesn't exist, try splitting and executing statements
      console.log('⚠️  exec_sql function not found, trying statement-by-statement execution...\n');
      
      // Split SQL into individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      if (statements.length === 0) {
        console.log('✅ No executable statements found (file may only contain comments)');
        return;
      }

      console.log(`📊 Found ${statements.length} statement(s) to execute\n`);

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement) {
          process.stdout.write(`   [${i + 1}/${statements.length}] Executing... `);
          
          // For most operations, we'll need to use the SQL editor manually
          console.log('⚠️\n');
          console.log('Cannot execute SQL directly through Supabase client.\n');
          console.log('📝 Please run this migration manually using one of these methods:\n');
          console.log('Method 1: Supabase Dashboard (Recommended)');
          console.log('  1. Go to https://supabase.com/dashboard/project/_/sql');
          console.log(`  2. Open file: ${migrationPath}`);
          console.log('  3. Copy and paste the contents');
          console.log('  4. Click "Run"\n');
          console.log('Method 2: psql command line');
          console.log(`  psql $DATABASE_URL -f "${migrationPath}"\n`);
          console.log('Method 3: Supabase CLI');
          console.log(`  supabase db push --include-all\n`);
          process.exit(1);
        }
      }
    } else {
      console.log('✅ Migration executed successfully!\n');
      if (data) {
        console.log('Result:', data);
      }
    }

    console.log('\n🎉 Migration completed!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:\n');
    console.error(error);
    console.log('\n📝 Please run the migration manually:');
    console.log('   1. Go to https://supabase.com/dashboard/project/_/sql');
    console.log(`   2. Open file: ${migrationPath}`);
    console.log('   3. Copy and paste the contents');
    console.log('   4. Click "Run"\n');
    process.exit(1);
  }
}

// Run the migration
runMigration();
