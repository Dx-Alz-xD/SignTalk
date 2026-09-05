# SignTalk — CLI Authentication Backend

The security / login layer for SignTalk. It is a command line app: sign up,
sign in, or recover an account with a one-time code sent to your email or
phone.

**Nothing is written to a database or to disk.** Accounts live in memory for
the life of the process, exactly as asked. The storage layer is isolated in
one file so a real database can be dropped in later without touching the
auth rules.

## Run it

```bash
pip3 install -r requirements.txt
```

```bash
python3 backend/cli.py
```

Two dependencies: `argon2-cffi` for password hashing, and `certifi` so
outbound TLS works on macOS. If `argon2-cffi` is missing the app still runs —
it falls back to PBKDF2-HMAC-SHA256 and says so on the banner — but Argon2id
is the intended algorithm.

## Demo credentials

| field | value |
| --- | --- |
| email | `example@gmail.com` |
| password | `123456` |
| username | `demo` |
| phone | `+15555550100` (a reserved-for-fiction number) |

Seeded at startup and printed on the banner. For a live SMS demo, override
the number with `export SIGNTALK_DEMO_PHONE=+91...` before launching.

## The menu

```
1  Sign up (new account)
2  Sign in with password
3  Forgot password / can't sign in
4  Session status  (who am I)
5  Sign out
6  Registered accounts  (dev view)
0  Exit
```

**1 — Sign up.** Username, email, password, and an optional phone number for
SMS codes. Validates the format of each and rejects duplicate emails and
usernames.

**2 — Sign in with password.** Accepts either the email or the username.
After 5 failed attempts the account locks for 5 minutes.

**3 — Forgot password.** This is the only way in without a password, and it
is a single flow with two possible endings:

```
enter email
   -> choose a channel:  email  or  SMS
   -> a 6-digit code is sent there
   -> enter the code
   -> code verified, then pick one:
        1. Set a new password
        2. Sign in now without changing it   <- passwordless
```

Passwordless sign-in is deliberately **not** a standing menu option. You only
reach it by proving you control the inbox or the phone on the account, which
is the same proof a password reset requires. Ending 2 leaves the password
untouched.

**6 — Registered accounts.** A dev view, useful on stage: it shows that what
is actually stored is an Argon2id hash, never the password anyone typed.

## Turning on real email and SMS

Out of the box both channels are **simulated** — the message is drawn in your
terminal, so a demo needs no network and no accounts. To get codes on an
actual phone and in an actual inbox, put credentials in a `.env` file:

```bash
cp .env.example .env
```

Then check your wiring before you need it:

```bash
python3 backend/check_delivery.py
```

That prints which channel is live and which is still simulated, with the
exact setup steps for whatever is missing. Once you have filled something in,
prove it end to end — this sends a real message and tells you which code to
look for:

```bash
python3 backend/check_delivery.py --email you@gmail.com --sms +919812345678
```

### SMS — Twilio

1. Sign up at `twilio.com/try-twilio`. The trial comes with credit and a
   phone number, no card required.
2. Copy your **Account SID** and **Auth Token** from `console.twilio.com`.
3. Your Twilio number is under **Phone Numbers → Active Numbers**. It must be
   SMS-capable.
4. **Trial accounts can only text verified numbers.** Add your own phone under
   **Phone Numbers → Verified Caller IDs** before you try to send to it —
   skipping this is the single most common failure.

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+15017122661
```

Twilio also prepends *"Sent from your Twilio trial account"* to every message
until you upgrade, which is worth knowing before it shows up on the projector.

`check_delivery.py` validates your SID and token against Twilio's Accounts
API *before* trying to send, so a credential problem never gets mistaken for
a recipient problem. It also tells you whether the account is Trial or Full.
Common Twilio errors are mapped to the actual fix rather than passed through
raw — an unverified trial recipient (21608), a bad token (20003), a From
number that is not yours (21659), and so on.

### Email — Gmail app password

Gmail will not accept your normal password over SMTP. You need an app
password, which needs 2-Step Verification on first:

1. Turn on 2-Step Verification at `myaccount.google.com/security`
2. Create an app password at `myaccount.google.com/apppasswords`
3. Paste the 16 characters into `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=the-16-character-app-password
```

Any other SMTP provider works the same way. `.env` is gitignored, so nothing
secret ends up in the repo.

### Fallback SMS — Textbelt, no signup

Left in as a backup if you want SMS without a Twilio account. Set
`TEXTBELT_KEY=textbelt` and the free key sends **one real text per day per
IP**. `TEXTBELT_KEY=textbelt_test` reports success and sends nothing. Twilio
takes priority whenever it is configured.

### Getting codes for the demo account

The seeded `example@gmail.com` account carries a reserved-for-fiction phone
number, which no carrier will deliver to. Point it at your own phone — the
same one you verified with Twilio:

```
SIGNTALK_DEMO_PHONE=+919812345678
```

### If real sending fails with a certificate error

macOS python.org builds do not trust the system keychain, so outbound HTTPS
dies with `CERTIFICATE_VERIFY_FAILED`. `certifi` in `requirements.txt` fixes
it, and the code hands that bundle to every SMTP and API call. If you skipped
the install, `pip3 install certifi` is the whole fix.

### What a simulated message looks like

```
+--------------------------------------------------------------+
|         INCOMING SMS (simulated - nothing was sent)          |
+--------------------------------------------------------------+
| To: +15555550100                                             |
|                                                              |
| SignTalk: your verification code is 284917. It expires in 5  |
| minutes. Do not share it with anyone.                        |
+--------------------------------------------------------------+
```

## Security decisions worth mentioning to the judges

| Concern | What the code does |
| --- | --- |
| Password storage | **Argon2id**, 64 MiB memory cost, 3 passes, parallelism 4, 16-byte salt — OWASP's recommended profile. Memory hardness is what makes GPU cracking expensive. |
| Algorithm migration | Hashes are self-describing. A legacy PBKDF2 hash still verifies, and is silently re-hashed to Argon2id the next time that user signs in. Raising the Argon2 parameters later triggers the same upgrade. |
| Identical passwords | Per-password random salt, so two users with the same password get different hashes. |
| Timing attacks | `hmac.compare_digest` for code comparison; a sign-in for a non-existent account still verifies against a real decoy hash, so it costs the same as a wrong password. |
| Account enumeration | Wrong password and unknown account return the same message. The channel is chosen *before* any lookup, so the prompt never reveals whether the account exists or has a phone on file. |
| Brute force | 5 failed passwords locks the account for 5 minutes. |
| One-time codes | Generated with `secrets`, stored **hashed**, expire in 5 minutes, 3 guesses, and a new code retires the old one across both channels. |
| Code replay | A code is burned the instant it verifies. What it buys is a separate single-use **recovery ticket**, good for 10 minutes and exactly one action. |
| Ticket preserved on user error | A rejected new password (too short, same as the old one) does not consume the ticket — the user retries without starting over. |
| Session hygiene | A password reset revokes every session already open for that account and clears any lockout. |
| Failed delivery | The challenge is only recorded after the send succeeds, so a Twilio or SMTP error never leaves a live code the user never received. |
| Shoulder surfing | Passwords are read with `getpass` (no echo); addresses and numbers are masked as `e*****e@gmail.com` and `+15*****0100` when echoed back. |

## Using it from the rest of SignTalk

The CLI is only a driver. Everything lives in `AuthService`, so the
translation app or a future REST layer can import it directly:

```python
from backend.auth import AuthService, CHANNEL_SMS

auth = AuthService()
auth.sign_up("aarav", "aarav@signtalk.dev", "sunflower22", "+919812345678")
session = auth.sign_in("aarav@signtalk.dev", "sunflower22")

# recovery: one code, then one of two endings
challenge = auth.request_recovery_code("aarav@signtalk.dev", CHANNEL_SMS)
ticket = auth.verify_recovery_code(challenge, "284917")

auth.reset_password_with_ticket(ticket, "new-password")   # ending 1
# auth.sign_in_with_ticket(ticket)                        # ending 2
```

Every failure raises a typed error from `backend/auth/errors.py`
(`ValidationError`, `InvalidCredentialsError`, `AccountLockedError`,
`ChallengeError`, `SessionError`, `DuplicateAccountError`), plus
`DeliveryError` for a send that fails — so callers never have to parse
message strings.

## Tests

```bash
python3 backend/smoke_test.py
```

29 named checks covering every flow plus the abuse cases — Argon2id
upgrade-on-login, lockout, code replay, ticket reuse, SMS with no number on
file, session revocation on reset, and the fact that a fresh process starts
empty.

## Layout

```
backend/
  cli.py            menu-driven terminal interface
  check_delivery.py verify real email / SMS credentials, send a test message
  config.py         reads .env
  smoke_test.py     end-to-end checks, no pytest needed
  auth/
    service.py      AuthService - all the rules live here
    security.py     Argon2id hashing, codes, tokens, validation
    models.py       User, Session, OtpChallenge, RecoveryTicket
    store.py        in-memory store (swap this for a database later)
    delivery.py     email + SMS senders: Twilio, SMTP, Textbelt, simulated
    errors.py       typed errors
```

## Deliberately not done

- **No database.** Per the brief. `store.py` is the only file that would change.
- **No password policy beyond a 6-character minimum**, so the `123456` demo
  credential stays valid. Strength is reported as advice, not enforced.
