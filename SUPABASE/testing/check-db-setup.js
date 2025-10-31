// Quick script to check database setup
const { createClient } = require('@supabase/supabase-js');

// You'll need to replace these with your actual Supabase URL and anon key
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';

async function checkDatabaseSetup() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Check if matches table exists
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('*')
      .limit(1);
    
    console.log('Matches table:', matchesError ? '❌ Missing' : '✅ Exists');
    
    // Check if match_participants table exists
    const { data: participants, error: participantsError } = await supabase
      .from('match_participants')
      .select('*')
      .limit(1);
    
    console.log('Match participants table:', participantsError ? '❌ Missing' : '✅ Exists');
    
    // Check if find_or_create_match function exists
    const { data: functionTest, error: functionError } = await supabase
      .rpc('find_or_create_match', {
        match_type: 'multiplayer',
        difficulty_level: 'easy'
      });
    
    console.log('find_or_create_match function:', functionError ? '❌ Missing' : '✅ Exists');
    
    if (functionError) {
      console.log('Function error details:', functionError);
    }
    
  } catch (error) {
    console.error('Error checking database:', error);
  }
}

checkDatabaseSetup();
