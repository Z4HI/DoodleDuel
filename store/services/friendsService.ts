import { supabase } from '../../SUPABASE/supabaseConfig';
import { AppDispatch } from '../index';

export interface FriendRequest {
  request_id: string;
  sender_id: string;
  sender_username?: string;
  sender_email?: string;
  created_at: string;
}

export interface Friend {
  friend_id: string;
  username: string;
  email: string;
  created_at: string;
}

export const friendsService = {
  // Send friend request
  sendFriendRequest: (receiverId: string) => async (dispatch: AppDispatch) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      // First, create the friend request in the database
      const { data, error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: user.id,
          receiver_id: receiverId,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending friend request:', error);
        return { success: false, error: error.message };
      }

      // Then, send push notification via edge function
      try {
        const { data: notificationResult, error: notificationError } = await supabase.functions.invoke(
          'send-friend-request-notification',
          {
            body: {
              sender_id: user.id,
              receiver_id: receiverId
            }
          }
        );

        if (notificationError) {
          console.error('Error sending push notification:', {
            error: notificationError,
            sender_id: user.id,
            receiver_id: receiverId,
            functionName: 'send-friend-request'
          });
          // Don't fail the friend request if notification fails
        } else {
          console.log('Push notification sent successfully:', notificationResult);
        }
      } catch (notificationError) {
        console.error('Error calling notification function:', {
          error: notificationError,
          sender_id: user.id,
          receiver_id: receiverId,
          functionName: 'send-friend-request'
        });
        // Don't fail the friend request if notification fails
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error sending friend request:', error);
      return { success: false, error: 'Failed to send friend request' };
    }
  },

  // Accept friend request
  acceptFriendRequest: (requestId: string) => async (dispatch: AppDispatch) => {
    try {
      const { data, error } = await supabase.rpc('accept_friend_request', {
        request_id: requestId
      });

      if (error) {
        console.error('Error accepting friend request:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error accepting friend request:', error);
      return { success: false, error: 'Failed to accept friend request' };
    }
  },

  // Decline friend request (delete the request)
  declineFriendRequest: (requestId: string) => async (dispatch: AppDispatch) => {
    try {
      console.log('Attempting to delete friend request with ID:', requestId);
      
      // First, let's check if the request exists
      const { data: existingRequest, error: checkError } = await supabase
        .from('friend_requests')
        .select('id, sender_id, receiver_id, status')
        .eq('id', requestId)
        .single();

      console.log('Existing request check:', { existingRequest, checkError });

      if (checkError) {
        console.error('Error checking existing request:', checkError);
        return { success: false, error: 'Request not found' };
      }

      // Now delete the request
      const { data, error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId)
        .select();

      console.log('Delete operation result:', { data, error });

      if (error) {
        console.error('Error declining friend request:', error);
        return { success: false, error: error.message };
      }

      console.log('Successfully deleted friend request');
      
      // Verify the deletion by checking if the request still exists
      const { data: verifyRequest, error: verifyError } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('id', requestId)
        .maybeSingle();

      console.log('Verification query result:', { verifyRequest, verifyError });
      
      if (verifyRequest) {
        console.error('Request still exists after deletion attempt');
        return { success: false, error: 'Request was not deleted' };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error declining friend request:', error);
      return { success: false, error: 'Failed to decline friend request' };
    }
  },

  // Get user's friends
  getFriends: () => async (dispatch: AppDispatch) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { data, error } = await supabase.rpc('get_user_friends', {
        user_uuid: user.id
      });

      if (error) {
        console.error('Error getting friends:', error);
        return { success: false, error: error.message, data: [] };
      }

      return { success: true, data: data || [] };
    } catch (error) {
      console.error('Error getting friends:', error);
      return { success: false, error: 'Failed to get friends', data: [] };
    }
  },

  // Get pending friend requests
  getPendingRequests: () => async (dispatch: AppDispatch) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      console.log('Getting pending requests for user:', user.id);

      const { data, error } = await supabase.rpc('get_pending_requests', {
        user_uuid: user.id
      });

      console.log('Database response:', { data, error });

      if (error) {
        console.error('Error getting pending requests:', error);
        return { success: false, error: error.message, data: [] };
      }

      console.log('Returning requests data:', data);
      return { success: true, data: data || [] };
    } catch (error) {
      console.error('Error getting pending requests:', error);
      return { success: false, error: 'Failed to get pending requests', data: [] };
    }
  },

  // Check friendship status between current user and another user
  checkFriendshipStatus: (otherUserId: string) => async (dispatch: AppDispatch) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      // Check if they are friends
      const { data: friendship, error: friendshipError } = await supabase
        .from('friends')
        .select('id')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},friend_id.eq.${user.id})`)
        .maybeSingle();

      if (friendshipError) {
        console.error('Error checking friendship:', friendshipError);
        return { status: 'error', error: friendshipError.message };
      }

      if (friendship) {
        return { status: 'friends' };
      }

      // Check if there's a pending request from current user to other user
      const { data: sentRequest, error: sentError } = await supabase
        .from('friend_requests')
        .select('id, status')
        .eq('sender_id', user.id)
        .eq('receiver_id', otherUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (sentError) {
        console.error('Error checking sent request:', sentError);
        return { status: 'error', error: sentError.message };
      }

      if (sentRequest) {
        return { status: 'request_sent' };
      }

      // Check if there's a pending request from other user to current user
      const { data: receivedRequest, error: receivedError } = await supabase
        .from('friend_requests')
        .select('id, status')
        .eq('sender_id', otherUserId)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (receivedError) {
        console.error('Error checking received request:', receivedError);
        return { status: 'error', error: receivedError.message };
      }

      if (receivedRequest) {
        return { status: 'request_received', requestId: receivedRequest.id };
      }

      // No relationship exists
      return { status: 'none' };
    } catch (error) {
      console.error('Error checking friendship status:', error);
      return { status: 'error', error: 'Failed to check friendship status' };
    }
  },

  // Remove friend
  removeFriend: (friendId: string) => async (dispatch: AppDispatch) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { error } = await supabase
        .from('friends')
        .delete()
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

      if (error) {
        console.error('Error removing friend:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing friend:', error);
      return { success: false, error: 'Failed to remove friend' };
    }
  }
};
