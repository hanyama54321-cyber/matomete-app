const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "anzen.matomete.app@gmail.com",
    pass: "<REDACTED>", // 元コードにはGmailアプリパスワードが直書きされていた。退避時に除去済み
  },
});

exports.sendAnnouncementEmail = onDocumentCreated(
  {
    document: "announcements/{docId}",
    region: "asia-northeast1",
  },
  async (event) => {
    const data = event.data.data();

    if (data.priority !== "high" && !data.mustRead) return null;

    const usersSnap = await admin.firestore()
      .collection("users")
      .where("emailNotify", "==", true)
      .get();

    if (usersSnap.empty) return null;

    const promises = [];
    usersSnap.forEach((doc) => {
      const user = doc.data();
      if (!user.email) return;

      const mailOptions = {
        from: '"安全配送まとめてアプリ" <anzen.matomete.app@gmail.com>',
        to: user.email,
        subject: `【重要】${data.title}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#13294B">📢 新しいお知らせが届いています</h2>
            <h3>${data.title}</h3>
            <p>${data.body}</p>
            <hr>
            <p style="color:#888;font-size:12px">
              安全配送まとめてアプリ · 株式会社HI-LINE
            </p>
          </div>
        `,
      };

      promises.push(transporter.sendMail(mailOptions));
    });

    return Promise.all(promises);
  }
);