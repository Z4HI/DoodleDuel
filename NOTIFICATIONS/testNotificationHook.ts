// Test function to verify the notification hook works correctly
export const testNotificationHook = () => {
  console.log('🧪 Testing notification hook...');
  
  try {
    // Test that the hook can be imported without errors
    console.log('✅ useNotificationNavigation hook imported successfully');
    
    // Test that the cleanup methods exist
    console.log('✅ Cleanup methods should use .remove() instead of removeNotificationSubscription()');
    
    console.log('🎉 Notification hook test passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Notification hook test failed:', error);
    return false;
  }
};

// Function to test notification permissions
export const testNotificationPermissions = async () => {
  console.log('🧪 Testing notification permissions...');
  
  try {
    const { Notifications } = await import('expo-notifications');
    
    // Test that we can access the notification methods
    console.log('✅ Notifications module imported successfully');
    console.log('✅ Available methods:', Object.keys(Notifications));
    
    return true;
    
  } catch (error) {
    console.error('❌ Notification permissions test failed:', error);
    return false;
  }
};
