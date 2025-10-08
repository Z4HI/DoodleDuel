import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { supabase } from '../SUPABASE/supabaseConfig';

export default function UserCheckScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserProfile();
  }, []);

  const checkUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // No user, sign out to trigger auth state change
        await supabase.auth.signOut();
        return;
      }

      // Check if user has a profile and username
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, "isNewUser"')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        
        // Try to create profile manually
        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            isNewUser: true,
            darkMode: false,
            expoPushToken: null
          });

        if (createError) {
          console.error('❌ Failed to create profile:', createError);
          await supabase.auth.signOut();
          return;
        }

        navigation.navigate('Username' as never);
        return;
      }

      if (!profile.username || profile.isNewUser) {
        // User needs to create username
        navigation.navigate('Username' as never);
        return;
      }

      // User has username, go to main app
      navigation.navigate('Home' as never);
      
    } catch (error) {
      console.error('Error checking user profile:', error);
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
