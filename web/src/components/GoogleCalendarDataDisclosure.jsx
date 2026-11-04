import React from "react";

export default function GoogleCalendarDataDisclosure() {
  return <p className="google-data-disclosure">
    If you connect Google Calendar, ESTIMATING reads calendar names and event details from the calendars you load so you can view, search, and manage them here. With the permission shown by Google, this feature can create, change, or delete events and calendars and manage sharing when you request it. Event details are fetched for this feature and are not stored in ESTIMATING’s project database; the encrypted connection token and permission details are stored by Supabase. <a href="https://estimating.studio/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a>
  </p>;
}
