// Nomad — shared Supabase client
// Fill in your project URL and anon key (Settings → API in your Supabase project).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://cfviihrfdattocnuspei.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmdmlpaHJmZGF0dG9jbnVzcGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTQxMTYsImV4cCI6MjA5OTk3MDExNn0.8F2QfSQTaHC4e91IyFAzfQvGawWFAtsvJrKZhW46hLo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);