import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';

export const usePushNotifications = (shouldRequest: boolean = true) => {
    const [expoPushToken, setExpoPushToken] = useState<string | null>(null);

    useEffect(() => {
        if (!shouldRequest) {
            return;
        }

        const registerForPushNotifications = async () => {
            if (!Device.isDevice) {
                return null;
            }

            const { status } = await Notifications.requestPermissionsAsync();
            
            if (status !== "granted") {
                return null;
            }

            const token = (await Notifications.getExpoPushTokenAsync()).data;
            return token;
        };

        registerForPushNotifications().then(token => {
            setExpoPushToken(token);
        });
    }, [shouldRequest]);

    return { expoPushToken };
}; 