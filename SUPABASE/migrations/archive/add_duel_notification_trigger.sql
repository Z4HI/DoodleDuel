-- Add trigger to automatically send duel notifications when a duel is created
-- This migration adds a database trigger that logs notification requests

-- Function to handle duel notification trigger
CREATE OR REPLACE FUNCTION public.send_duel_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only send notification for newly created duels with status 'duel_sent'
  IF TG_OP = 'INSERT' AND NEW.status = 'duel_sent' THEN
    -- Log the notification request
    RAISE NOTICE 'Duel notification requested for duel: %, challenger: %, opponent: %', 
      NEW.id, NEW.challenger_id, NEW.opponent_id;
    
    -- In a production environment, you could:
    -- 1. Insert into a notification queue table
    -- 2. Use pg_cron to process the queue
    -- 3. Or rely on the client to handle notifications
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_send_duel_notification ON public.duels;
CREATE TRIGGER trigger_send_duel_notification
  AFTER INSERT ON public.duels
  FOR EACH ROW
  EXECUTE FUNCTION public.send_duel_notification();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.send_duel_notification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_duel_notification() TO service_role;
