const REGION = 'asia-northeast1';

// 想定利用者数(数十名規模)に対して十分な余裕を持たせつつ、暴走時の被害を有限にする上限
const MAX_INSTANCES_TRIGGER = 10;
const MAX_INSTANCES_CALLABLE = 5;
const MAX_INSTANCES_SCHEDULED = 1;

// users/{code}.notifyPrefs のキー。firestore.rules の validNotifyPrefs() と一致させること
const NOTIFY_PREF_KEYS = {
  MUST_READ_ANNOUNCEMENT: 'mustReadAnnouncement',
  UNREAD_REMINDER: 'unreadReminder',
  MANUAL_ADDED: 'manualAdded',
  REPORT_REPLY: 'reportReply',
  NEW_REPORT_ADMIN: 'newReportAdmin',
};

// 長期未使用トークンの掃除しきい値(日数)
const STALE_TOKEN_DAYS = 180;

module.exports = {
  REGION,
  MAX_INSTANCES_TRIGGER,
  MAX_INSTANCES_CALLABLE,
  MAX_INSTANCES_SCHEDULED,
  NOTIFY_PREF_KEYS,
  STALE_TOKEN_DAYS,
};
