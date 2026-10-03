import React, { useState } from "react";
export default function AccountAvatar({ profile, size = 28 }) {
  const [failed, setFailed] = useState("");
  return <span className="account-avatar" style={{ width: size, height: size }} aria-hidden="true">
    {profile.avatar && failed !== profile.avatar ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(profile.avatar)} /> : profile.initials}
  </span>;
}
