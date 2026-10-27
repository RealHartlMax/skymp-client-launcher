<?php

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

function set_mail_error(string $message): void
{
    $_SESSION['manage_mail_error'] = $message;
}

function consume_mail_error(): ?string
{
    $value = isset($_SESSION['manage_mail_error']) ? (string) $_SESSION['manage_mail_error'] : '';
    unset($_SESSION['manage_mail_error']);

    return $value !== '' ? $value : null;
}

function mailer_is_ready(): bool
{
    if (!defined('MANAGE_MAILER_DRIVER')) {
        return false;
    }

    $driver = strtolower((string) MANAGE_MAILER_DRIVER);

    if ($driver !== 'smtp') {
        return false;
    }

    return trim((string) MANAGE_SMTP_HOST) !== ''
        && trim((string) MANAGE_SMTP_USERNAME) !== ''
        && trim((string) MANAGE_SMTP_PASSWORD) !== ''
        && trim((string) MANAGE_MAIL_FROM_ADDRESS) !== '';
}

function send_transactional_email(string $toEmail, string $subject, string $htmlBody, string $textBody = ''): bool
{
    if (!mailer_is_ready()) {
        set_mail_error(t('flash_mailer_not_configured'));
        return false;
    }

    if (!class_exists(PHPMailer::class)) {
        set_mail_error(t('flash_mailer_missing_dependency'));
        return false;
    }

    $mailer = new PHPMailer(true);

    try {
        $mailer->isSMTP();
        $mailer->CharSet = 'UTF-8';
        $mailer->Timeout = 15;
        $mailer->Host = (string) MANAGE_SMTP_HOST;
        $mailer->Port = (int) MANAGE_SMTP_PORT;
        $mailer->SMTPAuth = true;
        $mailer->Username = (string) MANAGE_SMTP_USERNAME;
        $mailer->Password = (string) MANAGE_SMTP_PASSWORD;

        $encryption = strtolower((string) MANAGE_SMTP_ENCRYPTION);
        if ($encryption === 'ssl') {
            $mailer->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls') {
            $mailer->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } elseif ($encryption === 'none' && in_array(strtolower($mailer->Host), ['127.0.0.1', 'localhost', '::1'], true)) {
            // Isolated loopback mail capture for local development only.
            $mailer->SMTPSecure = '';
            $mailer->SMTPAutoTLS = false;
        } else {
            set_mail_error(t('flash_mailer_not_configured'));
            return false;
        }

        $fromAddress = (string) MANAGE_MAIL_FROM_ADDRESS;
        $fromName = trim((string) MANAGE_MAIL_FROM_NAME) !== '' ? (string) MANAGE_MAIL_FROM_NAME : (string) MANAGE_APP_NAME;

        $mailer->setFrom($fromAddress, $fromName);
        $mailer->addAddress($toEmail);

        $replyTo = trim((string) MANAGE_MAIL_REPLY_TO);
        if ($replyTo !== '') {
            $mailer->addReplyTo($replyTo);
        }

        $mailer->isHTML(true);
        $mailer->Subject = $subject;
        $mailer->Body = $htmlBody;
        $mailer->AltBody = $textBody !== '' ? $textBody : strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $htmlBody));

        $mailer->send();
        return true;
    } catch (MailException $exception) {
        set_mail_error(t('flash_mail_send_failed', ['error' => $exception->getMessage()]));
        return false;
    }
}
