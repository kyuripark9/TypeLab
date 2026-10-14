/* Privacy and terms (/privacy): what TypeLab keeps and why, the cookies and browser storage it uses, who else takes part
   (the interface's type, Google sign-in, the reset email), what a person can delete, and the terms the site is offered
   on, the fonts' licences among them. Kept true to the code: server/app.ts sets the cookies, server/accounts.ts says
   how long a sign-in and a reset last, client/lib/prefs.ts lists what the browser keeps. */
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ACCOUNT, DESIGNS } from '../lib/routes';
import { AccountCorner } from '../components/Account';
import { Toast } from '../components/Chrome';
import { Brand } from '../components/Header';

const UPDATED = '13 October 2026';

function Part({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section className="legal-part" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  useEffect(() => { document.title = 'Privacy & terms — TypeLab'; }, []);
  return (
    <div className="library">
      <header className="top">
        <div className="top-left"><Brand /></div>
        <div className="top-actions">
          <Link className="btn ghost" to={DESIGNS}>My designs</Link>
        </div>
      </header>
      <AccountCorner />
      <main className="lib-main legal">
        <div className="lib-head"><h1>Privacy &amp; terms</h1><p>Updated {UPDATED}</p></div>
        <p className="legal-lead">TypeLab keeps what it needs to save your fonts and your account, and nothing more. There are
          no ads, no analytics and no tracking, and nothing is sold.</p>

        <Part title="What TypeLab keeps">
          <ul>
            <li><b>Your designs.</b> The fonts you save: their names, settings, the letters you draw and their histories.
              Saved while signed out, they belong to this browser; saved in an account, to the account.</li>
            <li><b>Your account.</b> Your email, your name, your password as a scrypt hash (never the password itself), the
              Google account you connected (its id and email), and when you signed up.</li>
            <li><b>Sign-ins.</b> A random code for each browser signed in, kept only as a hash, for 90 days. A password
              reset’s link works once, for an hour.</li>
          </ul>
        </Part>

        <Part title="Cookies and this browser">
          <p>Three cookies, all needed for TypeLab to work:</p>
          <ul>
            <li><code>typelab_owner</code> knows which browser saved the fonts made while signed out (10 years).</li>
            <li><code>typelab_session</code> keeps you signed in (90 days).</li>
            <li><code>typelab_google</code> holds a Google sign-in while it is under way (10 minutes).</li>
          </ul>
          <p>Your preferences, such as panel sizes, views, the tour seen and the last email you signed in with, stay in
            this browser’s own storage and never reach the server.</p>
        </Part>

        <Part title="Who else takes part">
          <ul>
            <li>Your browser loads the interface’s typefaces from Google Fonts and Fontshare, which see your IP address and
              browser as any website does.</li>
            <li>Signing in with Google, Google tells TypeLab your Google account’s id, email and name.</li>
            <li>A password reset’s email goes through the email service this site uses.</li>
            <li>The server that runs TypeLab may log requests (address, time, page) for a short while, to keep it working
              and safe.</li>
          </ul>
        </Part>

        <Part title="Your choices">
          <ul>
            <li>Delete any font in <Link to={DESIGNS}>My designs</Link>.</li>
            <li>Delete your account in <Link to={ACCOUNT}>Account settings</Link>: the account and every font in it go at once.</li>
            <li>Keep your own copy of any font: Export, then Design file.</li>
            <li>Clearing this browser’s cookies loses the fonts saved here while signed out. Sign in first to keep them.</li>
          </ul>
        </Part>

        <Part id="terms" title="Terms">
          <ul>
            <li><b>Using TypeLab.</b> It’s free. Keep it working for everyone: don’t try to reach other people’s fonts or
              accounts, don’t flood it with automated requests, and don’t put anything unlawful in it.</li>
            <li><b>Your fonts.</b> The fonts you make are yours to use for anything, commercial work included. One made from
              TypeLab’s own fonts comes under the SIL Open Font License, as they do (Copyright TypeLab): use it, change
              it, share it and ship it with what you make, though don’t sell the font by itself. One made from a font
              from Google Fonts comes under that font’s licence and keeps its copyright notice; TypeLab writes both
              into the files it exports.</li>
            <li><b>No guarantees.</b> TypeLab is offered as it is. Keep copies of the fonts that matter to you. It may
              change, and it may stop.</li>
            <li><b>Accounts.</b> Keep your password to yourself. An account used to abuse TypeLab may be closed.</li>
            <li><b>Changes.</b> When these change, the date at the top does too.</li>
          </ul>
        </Part>
      </main>
      <Toast />
    </div>
  );
}
