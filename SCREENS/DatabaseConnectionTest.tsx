import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../SUPABASE/supabaseConfig';

export default function DatabaseConnectionTest() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testDatabaseConnection = async () => {
    setLoading(true);
    setResults([]);
    
    addResult('🧪 Starting database connection test...');
    
    try {
      // Test 1: Basic connection
      addResult('🔍 Test 1: Testing basic Supabase connection...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        addResult(`❌ Auth connection failed: ${authError.message}`);
        return;
      }
      addResult('✅ Auth connection works');
      
      // Test 2: Check if profiles table exists
      addResult('🔍 Test 2: Testing profiles table access...');
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      
      if (profilesError) {
        addResult(`❌ Profiles table error: ${profilesError.message}`);
        addResult(`❌ Error code: ${profilesError.code}`);
        addResult(`❌ Error details: ${JSON.stringify(profilesError.details)}`);
        return;
      }
      
      addResult('✅ Profiles table accessible');
      
      // Test 3: Try to create a test profile
      addResult('🔍 Test 3: Testing profile creation...');
      const testId = 'test-user-' + Date.now();
      const { data: insertData, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: testId,
          email: 'test@example.com'
        });
      
      if (insertError) {
        addResult(`❌ Profile creation failed: ${insertError.message}`);
        addResult(`❌ Error code: ${insertError.code}`);
        addResult(`❌ Error details: ${JSON.stringify(insertError.details)}`);
        addResult(`❌ Error hint: ${insertError.hint}`);
        return;
      }
      
      addResult('✅ Profile creation works');
      addResult(`✅ Insert data: ${JSON.stringify(insertData)}`);
      
      // Clean up test data
      addResult('🧹 Cleaning up test data...');
      const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', testId);
      
      if (deleteError) {
        addResult(`⚠️ Cleanup failed: ${deleteError.message}`);
      } else {
        addResult('✅ Test data cleaned up');
      }
      
      addResult('🎉 All database tests passed!');
      
    } catch (error) {
      addResult(`❌ Test failed with exception: ${error.message}`);
      addResult(`❌ Error stack: ${error.stack}`);
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Database Connection Test</Text>
      
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={testDatabaseConnection}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Testing...' : 'Test Database Connection'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.button, styles.secondaryButton]} 
        onPress={clearResults}
      >
        <Text style={styles.buttonText}>Clear Results</Text>
      </TouchableOpacity>
      
      <ScrollView style={styles.resultsContainer}>
        {results.map((result, index) => (
          <Text key={index} style={styles.resultText}>
            {result}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  secondaryButton: {
    backgroundColor: '#666',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  resultText: {
    fontSize: 12,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
});
