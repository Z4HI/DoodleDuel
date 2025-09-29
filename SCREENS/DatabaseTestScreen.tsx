import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../SUPABASE/supabaseConfig';

export default function DatabaseTestScreen() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runDatabaseTests = async () => {
    setLoading(true);
    setTestResults([]);
    
    addResult('🧪 Starting database tests...');
    
    try {
      // Test 1: Basic connection
      addResult('🔍 Test 1: Testing basic connection...');
      const { data: connectionTest, error: connectionError } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);
      
      if (connectionError) {
        addResult(`❌ Connection failed: ${connectionError.message}`);
        return;
      }
      addResult('✅ Connection test passed');
      
      // Test 2: Check table structure
      addResult('🔍 Test 2: Checking table structure...');
      const { data: structureTest, error: structureError } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);
      
      if (structureError) {
        addResult(`❌ Structure check failed: ${structureError.message}`);
        return;
      }
      addResult('✅ Structure check passed');
      
      // Test 3: Try minimal insert
      addResult('🔍 Test 3: Testing minimal insert...');
      const testData = {
        id: 'test-user-' + Date.now(),
        email: 'test@example.com'
      };
      
      const { data: insertTest, error: insertError } = await supabase
        .from('profiles')
        .insert(testData);
      
      if (insertError) {
        addResult(`❌ Insert test failed: ${insertError.message}`);
        addResult(`❌ Error details: ${JSON.stringify(insertError)}`);
        return;
      }
      
      addResult('✅ Insert test successful');
      
      // Clean up
      addResult('🧹 Cleaning up test data...');
      const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', testData.id);
      
      if (deleteError) {
        addResult(`⚠️ Cleanup failed: ${deleteError.message}`);
      } else {
        addResult('✅ Test data cleaned up');
      }
      
      addResult('🎉 All tests passed!');
      
    } catch (error) {
      addResult(`❌ Exception: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Database Test Screen</Text>
      
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={runDatabaseTests}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Running Tests...' : 'Run Database Tests'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.button, styles.secondaryButton]} 
        onPress={clearResults}
      >
        <Text style={styles.buttonText}>Clear Results</Text>
      </TouchableOpacity>
      
      <ScrollView style={styles.resultsContainer}>
        {testResults.map((result, index) => (
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
