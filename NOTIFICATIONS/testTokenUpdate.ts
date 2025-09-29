import { supabase } from '../SUPABASE/supabaseConfig';

// Test function to verify expoPushToken field exists and can be updated
export const testTokenUpdate = async (userId: string) => {
  console.log('🧪 Testing token update functionality...');
  
  try {
    // First, let's check if the field exists by selecting it
    const { data: profile, error: selectError } = await supabase
      .from('profiles')
      .select('id, expoPushToken')
      .eq('id', userId)
      .single();

    if (selectError) {
      console.error('❌ Error selecting profile:', selectError);
      return false;
    }

    console.log('✅ Profile found:', profile);
    console.log('✅ Current expoPushToken value:', profile.expoPushToken);

    // Test updating with a dummy token
    const testToken = `test-token-${Date.now()}`;
    const { data, error } = await supabase
      .from('profiles')
      .update({ expoPushToken: testToken })
      .eq('id', userId);

    if (error) {
      console.error('❌ Error updating test token:', error);
      return false;
    }

    console.log('✅ Test token update successful:', data);

    // Verify the update worked
    const { data: updatedProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('expoPushToken')
      .eq('id', userId)
      .single();

    if (verifyError) {
      console.error('❌ Error verifying update:', verifyError);
      return false;
    }

    console.log('✅ Verified token update:', updatedProfile);
    return true;

  } catch (error) {
    console.error('❌ Exception in testTokenUpdate:', error);
    return false;
  }
};
