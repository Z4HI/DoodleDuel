// Test script to verify database function
const { createClient } = require('@supabase/supabase-js');

// Replace with your actual Supabase URL and anon key
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';

async function testDatabaseFunction() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    console.log('Testing find_or_create_match function...');
    
    const { data, error } = await supabase.rpc('find_or_create_match', {
      match_type: 'multiplayer',
      difficulty_level: 'easy'
    });
    
    if (error) {
      console.error('Function call failed:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    } else {
      console.log('Function call successful:', data);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testDatabaseFunction();
