import * as Notifications from 'expo-notifications';

// Schedule a local notification
export const scheduleLocalNotification = async (
  title: string,
  body: string,
  seconds: number = 0,
  data?: any
) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
    },
    trigger: seconds > 0 ? { seconds } : null,
  });
};

// Cancel all scheduled notifications
export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

// Get all scheduled notifications
export const getAllScheduledNotifications = async () => {
  return await Notifications.getAllScheduledNotificationsAsync();
};

// Send a push notification (this would typically be done from your backend)
export const sendPushNotification = async (
  expoPushToken: string,
  title: string,
  body: string,
  data?: any
) => {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  // This is just for demonstration - in production, you'd send this from your backend
  console.log('Push notification payload:', message);
  
  // In a real app, you'd make an API call to your backend here
  // fetch('https://your-backend.com/send-notification', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify(message),
  // });
};
