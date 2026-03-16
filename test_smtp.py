import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

def test_email():
    print(f"Testing with email: {SENDER_EMAIL}")
    print(f"Password starts with: {SENDER_PASSWORD[:2]}...")
    
    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = SENDER_EMAIL
        msg['Subject'] = "SMTP Test"
        msg.attach(MIMEText("This is a test to verify SMTP settings.", 'plain'))
        
        print("Connecting to server...")
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
        print("Starting TLS...")
        server.starttls()
        print("Logging in...")
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        print("Sending...")
        server.send_message(msg)
        server.quit()
        print("SUCCESS: Email sent successfully!")
    except Exception as e:
        print(f"FAILED: {str(e)}")

if __name__ == "__main__":
    test_email()
