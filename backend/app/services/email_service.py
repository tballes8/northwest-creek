"""
Email Service - Send verification and notification emails using SendGrid
"""
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content
from app.config import settings


class EmailService:
    def __init__(self):
        self.api_key = settings.SENDGRID_API_KEY
        self.from_email = settings.FROM_EMAIL
        self.from_name = settings.FROM_NAME
        
        # Only initialize SendGrid client if API key is provided
        if self.api_key:
            self.sg = SendGridAPIClient(self.api_key)
        else:
            self.sg = None
            print("⚠️ Warning: SENDGRID_API_KEY not configured")
    
    def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Send an email using SendGrid"""
        if not self.sg:
            print("❌ Cannot send email: SendGrid not configured")
            return False
            
        try:
            # Create message
            message = Mail(
                from_email=Email(self.from_email, self.from_name),
                to_emails=To(to_email),
                subject=subject,
                html_content=Content("text/html", html_content)
            )
            
            # Send email
            response = self.sg.send(message)
            
            if response.status_code in [200, 202]:
                print(f"✅ Email sent to {to_email} (Status: {response.status_code})")
                return True
            else:
                print(f"⚠️ Email send returned status {response.status_code} for {to_email}")
                return False
            
        except Exception as e:
            print(f"❌ Failed to send email to {to_email}: {str(e)}")
            return False
    
    def send_verification_email(self, to_email: str, verification_token: str, user_name: str) -> bool:
        """Send account verification email"""
        verification_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6; 
                    color: #333;
                    margin: 0;
                    padding: 0;
                    background-color: #f3f4f6;
                }}
                .container {{ 
                    max-width: 600px; 
                    margin: 40px auto; 
                    background-color: #ffffff;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }}
                .header {{ 
                    background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); 
                    color: white; 
                    padding: 40px 30px; 
                    text-align: center; 
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 28px;
                    font-weight: 700;
                }}
                .content {{ 
                    padding: 40px 30px; 
                }}
                .content p {{
                    margin: 0 0 16px 0;
                    color: #374151;
                }}
                .button {{ 
                    display: inline-block; 
                    background: #0d9488; 
                    color: white; 
                    padding: 14px 32px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    font-weight: 600; 
                    margin: 24px 0;
                    transition: background 0.3s;
                }}
                .button:hover {{
                    background: #0f766e;
                }}
                .link-box {{
                    background: #f3f4f6;
                    padding: 16px;
                    border-radius: 6px;
                    word-break: break-all;
                    margin: 20px 0;
                    border-left: 4px solid #0d9488;
                }}
                .link-box p {{
                    margin: 0;
                    font-size: 13px;
                    color: #6b7280;
                }}
                .features {{
                    background: #f9fafb;
                    padding: 24px;
                    border-radius: 6px;
                    margin: 24px 0;
                }}
                .features ul {{
                    margin: 0;
                    padding-left: 20px;
                }}
                .features li {{
                    margin: 8px 0;
                    color: #374151;
                }}
                .footer {{ 
                    text-align: center; 
                    padding: 30px; 
                    background: #f9fafb;
                    color: #6b7280; 
                    font-size: 14px; 
                    border-top: 1px solid #e5e7eb;
                }}
                .footer p {{
                    margin: 4px 0;
                }}
                .warning {{
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 12px 16px;
                    border-radius: 4px;
                    margin: 20px 0;
                }}
                .warning p {{
                    margin: 0;
                    color: #92400e;
                    font-size: 14px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Welcome to Northwest Creek!</h1>
                </div>
                <div class="content">
                    <p><strong>Hi {user_name},</strong></p>
                    
                    <p>Thank you for registering with Northwest Creek - your intelligent stock analysis platform!</p>
                    
                    <p>To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
                    
                    <div style="text-align: center;">
                        <a href="{verification_url}" class="button">✓ Verify Email Address</a>
                    </div>
                    
                    <p style="font-size: 14px; color: #6b7280;">Or copy and paste this link into your browser:</p>
                    <div class="link-box">
                        <p>{verification_url}</p>
                    </div>
                    
                    <div class="warning">
                        <p><strong>⏰ This link will expire in 24 hours.</strong></p>
                    </div>
                    
                    <div class="features">
                        <p><strong>Once verified, you'll have access to:</strong></p>
                        <ul>
                            <li>✅ Track up to 5 stocks in your watchlist</li>
                            <li>✅ Monitor 3 portfolio positions</li>
                            <li>✅ Set 5 price alerts</li>
                            <li>✅ Real-time market data and quotes</li>
                            <li>✅ Advanced technical indicators</li>
                        </ul>
                    </div>
                    
                    <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">
                        If you didn't create an account with Northwest Creek, you can safely ignore this email.
                    </p>
                    
                    <p style="margin-top: 32px;"><strong>Best regards,</strong><br>The Northwest Creek Team</p>
                </div>
                <div class="footer">
                    <p><strong>Northwest Creek</strong></p>
                    <p>Intelligent Stock Analysis & Portfolio Management</p>
                    <p style="margin-top: 12px;">This is an automated email, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=to_email,
            subject="🎉 Verify Your Northwest Creek Account",
            html_content=html_content
        )


# Singleton instance
email_service = EmailService()