-- Add trigger to automatically send duel notifications when a duel is created
-- This is a simpler version that logs the notification request for client-side handling

-- Function to handle duel notification trigger
CREATE OR REPLACE FUNCTION public.handle_duel_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process newly created duels with status 'duel_sent'
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
DROP TRIGGER IF EXISTS trigger_handle_duel_notification ON public.duels;
CREATE TRIGGER trigger_handle_duel_notification
  AFTER INSERT ON public.duels
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_duel_notification();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_duel_notification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_duel_notification() TO service_role;
