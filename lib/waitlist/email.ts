/**
 * Email dispatch utility (Local Console Mock Logger)
 */

export async function sendWaitlistEmail(
  email: string,
  fullName: string,
  position: number,
  referralLink: string
): Promise<boolean> {

  const subject = `🚀 You're on the VisionBoard Waitlist! (Position #${position})`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>VisionBoard Waitlist</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            border: 1px solid #e2e8f0;
          }
          .header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            padding: 32px;
            text-align: center;
            color: #ffffff;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.025em;
          }
          .content {
            padding: 32px;
            line-height: 1.6;
          }
          .content h2 {
            margin-top: 0;
            font-size: 18px;
            color: #1e3a8a;
          }
          .position-badge {
            background-color: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            margin: 24px 0;
          }
          .position-number {
            font-size: 36px;
            font-weight: 900;
            color: #2563eb;
            margin: 0;
          }
          .position-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            font-weight: 700;
            margin-top: 4px;
          }
          .boost-section {
            background-color: #fdf2f8;
            border: 1px solid #fbcfe8;
            border-radius: 12px;
            padding: 20px;
            margin-top: 24px;
          }
          .boost-title {
            font-weight: 700;
            color: #db2777;
            margin: 0 0 8px 0;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .referral-box {
            background-color: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px;
            font-family: monospace;
            font-size: 13px;
            text-align: center;
            margin: 12px 0;
            word-break: break-all;
            color: #334155;
          }
          .perk-list {
            margin: 12px 0 0 0;
            padding-left: 20px;
            font-size: 13px;
            color: #475569;
          }
          .perk-list li {
            margin-bottom: 6px;
          }
          .footer {
            background-color: #f8fafc;
            padding: 24px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>VisionBoard</h1>
          </div>
          <div class="content">
            <h2>Welcome to Early Access, ${fullName}!</h2>
            <p>Thanks for joining the waitlist for VisionBoard. We are building the next-generation AI-powered project roadmaps and 2D canvas execution engine, and we're excited to have you with us.</p>
            
            <div class="position-badge">
              <p class="position-number">#${position}</p>
              <p class="position-label">Your Current Waitlist Position</p>
            </div>
            
            <div class="boost-section">
              <p class="boost-title">⚡ Want to jump ahead in line?</p>
              <p style="margin: 0; font-size: 13px; color: #475569;">
                Share your unique referral link with your teammates. Every person who signs up using your link moves you up and locks in higher priority access:
              </p>
              <div class="referral-box">${referralLink}</div>
              <ul class="perk-list">
                <li><strong>1 Teammate:</strong> Moves you up <strong>5 spots</strong> instantly.</li>
                <li><strong>3 Teammates:</strong> Jumps you straight into the <strong>Top 20 VIP Queue</strong>.</li>
                <li><strong>5 Teammates:</strong> Unlocks an <strong>Instant Access Token</strong> to create your workspace.</li>
              </ul>
            </div>
            
            <p style="margin-top: 24px; font-size: 14px;">
              We'll email you as soon as your spot is unlocked or an invite token is dispatched. In the meantime, feel free to share your link to speed up your access!
            </p>
            <p style="margin-top: 24px; font-size: 14px; font-weight: 600;">
              Best regards,<br>
              The VisionBoard Team
            </p>
          </div>
          <div class="footer">
            &copy; 2026 VisionBoard Inc. All rights reserved.<br>
            You received this email because you signed up for early access to VisionBoard.
          </div>
        </div>
      </body>
    </html>
  `;

  console.log(`
========================================================================
[EMAIL DISPATCH] Mock Waitlist Email Logged
------------------------------------------------------------------------
To: ${email} (${fullName})
Subject: ${subject}
Position: #${position}
Referral Link: ${referralLink}
========================================================================
  `);
  return true;
}

/**
 * Sends a magic invite email to an approved waitlist candidate.
 * The email contains their personalised sign-up link with their invite token.
 */
export async function sendInviteEmail(
  email: string,
  fullName: string,
  inviteToken: string,
  origin: string
): Promise<boolean> {
  const signupUrl = `${origin}/signup?inviteToken=${inviteToken}`;
  const subject = `🎉 Your VisionBoard Access Has Been Unlocked!`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>VisionBoard — You're In!</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            border: 1px solid #e2e8f0;
          }
          .header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            padding: 32px;
            text-align: center;
            color: #ffffff;
          }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; }
          .content { padding: 32px; line-height: 1.6; }
          .content h2 { margin-top: 0; font-size: 20px; color: #1e3a8a; }
          .cta-box {
            background: linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%);
            border: 1px solid #86efac;
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            margin: 24px 0;
          }
          .cta-box p { margin: 0 0 16px 0; font-size: 14px; color: #166534; font-weight: 600; }
          .cta-button {
            display: inline-block;
            background-color: #16a34a;
            color: #ffffff;
            text-decoration: none;
            font-weight: 800;
            font-size: 15px;
            padding: 14px 32px;
            border-radius: 12px;
          }
          .token-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 14px;
            font-family: monospace;
            font-size: 12px;
            color: #475569;
            word-break: break-all;
            margin-top: 12px;
          }
          .footer {
            background-color: #f8fafc;
            padding: 24px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>VisionBoard</h1>
          </div>
          <div class="content">
            <h2>🎉 You're In, ${fullName}!</h2>
            <p>
              Great news — your spot on the VisionBoard waitlist has been approved.
              You now have exclusive early access to the AI-native product management workspace.
            </p>
            <div class="cta-box">
              <p>Your personalised sign-up link is ready. This link is unique to you.</p>
              <a href="${signupUrl}" class="cta-button">Launch My Workspace →</a>
              <div class="token-box">${signupUrl}</div>
            </div>
            <p style="font-size: 13px; color: #64748b;">
              This invite link is single-use and unique to your account. Do not share it with others.
              If you have any questions, reply to this email and our team will be happy to help.
            </p>
            <p style="margin-top: 24px; font-size: 14px; font-weight: 600;">
              Welcome aboard,<br>
              The VisionBoard Team
            </p>
          </div>
          <div class="footer">
            &copy; 2026 VisionBoard Inc. All rights reserved.<br>
            You received this email because your waitlist application was approved.
          </div>
        </div>
      </body>
    </html>
  `;

  console.log(`
========================================================================
[INVITE EMAIL DISPATCH] Mock Invite Email Logged
------------------------------------------------------------------------
To: ${email} (${fullName})
Subject: ${subject}
Note: Configure RESEND_API_KEY to send real emails. Token delivered via email only.
========================================================================
  `);
  return true;
}

