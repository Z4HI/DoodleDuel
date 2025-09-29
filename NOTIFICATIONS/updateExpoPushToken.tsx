import { supabase } from '../SUPABASE/supabaseConfig';

export const updateExpoPushToken = async (expoPushToken: string, userId: string) => {
    try {
      // First, check if the expoPushToken field exists by trying to select it
      const { data: profile, error: selectError } = await supabase
        .from('profiles')
        .select('id, expoPushToken')
        .eq('id', userId)
        .single();

      if (selectError) {
        return false;
      }

      // If we can select the field, try to update it
      const { data, error } = await supabase
        .from('profiles')
        .update({ expoPushToken: expoPushToken })
        .eq('id', userId);

      if (error) {
        console.error('Error updating expo push token:', error);
        return false;
      } else {
        return true;
      }
    } catch (error) {
      console.error('Exception in updateExpoPushToken:', error);
      return false;
    }
};


