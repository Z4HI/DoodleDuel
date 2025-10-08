import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function TestNavigationScreen() {
  const navigation = useNavigation();

  const testUsernameNavigation = () => {
    console.log('🧪 Testing navigation to Username screen...');
    try {
      navigation.navigate('Username' as never);
      console.log('✅ Navigation to Username successful');
    } catch (error) {
      console.error('❌ Navigation to Username failed:', error);
    }
  };

  const testHomeNavigation = () => {
    console.log('🧪 Testing navigation to Home...');
    try {
      navigation.navigate('Home' as never);
      console.log('✅ Navigation to Home successful');
    } catch (error) {
      console.error('❌ Navigation to Home failed:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Navigation Test Screen</Text>
      
      <TouchableOpacity style={styles.button} onPress={testUsernameNavigation}>
        <Text style={styles.buttonText}>Test Username Navigation</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testHomeNavigation}>
        <Text style={styles.buttonText}>Test Home Navigation</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    width: 200,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});
