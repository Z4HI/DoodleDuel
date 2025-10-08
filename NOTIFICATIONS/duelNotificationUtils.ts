import { supabase } from '../SUPABASE/supabaseConfig';

/**
 * Send notification when a duel is created
 */
export const sendDuelSentNotification = async (duelId: string): Promise<boolean> => {
  try {
    console.log('Sending duel sent notification for duel:', duelId);
    console.log('DuelId type:', typeof duelId);
    console.log('DuelId value:', JSON.stringify(duelId));
    
    const { data: result, error } = await supabase.functions.invoke('send-duel-notification-', {
      body: { duel_id: duelId }
    });

    if (error) {
      console.error('Error sending duel sent notification:', error);
      console.error('Error details:', JSON.stringify(error));
      return false;
    }

    console.log('Duel sent notification sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Exception sending duel sent notification:', error);
    return false;
  }
};

/**
 * Send notification when a duel is accepted
 */
export const sendDuelAcceptedNotification = async (duelId: string): Promise<boolean> => {
  try {
    console.log('Sending duel accepted notification for duel:', duelId);
    
    const { data: result, error } = await supabase.functions.invoke('duel-accepted-notification', {
      body: { duel_id: duelId }
    });

    if (error) {
      console.error('Error sending duel accepted notification:', error);
      return false;
    }

    console.log('Duel accepted notification sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Exception sending duel accepted notification:', error);
    return false;
  }
};
