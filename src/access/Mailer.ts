import nodemailer from "nodemailer"
import type { TokenPurpose } from "./MemberSession"

// Mail is sent through the SMTP server of SMTP_URL (smtps://user:password@host:465),
// from the address of MAIL_FROM. The links it carries start with PUBLIC_URL: the
// address a request came through is what its sender says, and is never mailed.

export type MailSettings = Readonly<{ smtpUrl: string; from: string; publicUrl: string }>

export type Mail = Readonly<{ to: string; subject: string; text: string }>

const SEND_TIMEOUT_IN_MS = 15000

export function mailSettingsOf(env: Record<string, string | undefined>) {
  const [smtpUrl, from, publicUrl] = [env.SMTP_URL, env.MAIL_FROM, env.PUBLIC_URL].map(
    (value) => (value ?? "").trim(),
  )

  return smtpUrl === "" || from === "" || publicUrl === ""
    ? undefined
    : { smtpUrl, from, publicUrl: publicUrl.replace(/\/+$/, "") }
}

// Undefined when the mail is not set up: links are then shown to the administrator, to pass on by hand
export const MAIL = mailSettingsOf(import.meta.env)

export function passwordLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/account/password?token=${token}`
}

export function invitationMail(member: { name: string; email: string }, link: string): Mail {
  return {
    to: member.email,
    subject: "Votre espace adhérent Lexicon",
    text: [
      `Bonjour ${member.name},`,
      "",
      "OSFarm vous a ouvert un espace adhérent sur le Lexicon. Vous y créez vos clés d'API,",
      "vous les limitez aux adresses ou aux sites qui s'en servent, et vous les révoquez.",
      "",
      "Pour choisir votre mot de passe, ouvrez ce lien (valable sept jours, une seule fois) :",
      link,
      "",
      `Votre identifiant est cette adresse : ${member.email}`,
      "",
      "Si vous n'attendiez pas ce message, vous pouvez l'ignorer : sans mot de passe, le compte ne sert à rien.",
      "",
      "L'association OSFarm",
    ].join("\n"),
  }
}

export function resetMail(member: { name: string; email: string }, link: string): Mail {
  return {
    to: member.email,
    subject: "Lexicon : choisir un nouveau mot de passe",
    text: [
      `Bonjour ${member.name},`,
      "",
      "Un nouveau mot de passe a été demandé pour votre espace adhérent du Lexicon.",
      "Pour le choisir, ouvrez ce lien (valable une heure, une seule fois) :",
      link,
      "",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe ne change pas.",
      "",
      "L'association OSFarm",
    ].join("\n"),
  }
}

export function adminPasswordLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/admin/password?token=${token}`
}

export function adminResetMail(email: string, link: string): Mail {
  return {
    to: email,
    subject: "Lexicon : nouveau mot de passe d'administration",
    text: [
      "Bonjour,",
      "",
      "Un nouveau mot de passe a été demandé pour votre compte d'administration du Lexicon.",
      "Pour le choisir, ouvrez ce lien (valable une heure, une seule fois) :",
      link,
      "",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe ne change pas.",
      "",
      "L'association OSFarm",
    ].join("\n"),
  }
}

export function mailOf(
  purpose: TokenPurpose,
  member: { name: string; email: string },
  link: string,
): Mail {
  return purpose === "invitation" ? invitationMail(member, link) : resetMail(member, link)
}

/**
 * @returns whether the SMTP server took the message. A failure is logged without the message.
 */
export async function sendMail(mail: Mail, settings: MailSettings | undefined = MAIL) {
  if (settings === undefined) {
    return false
  }

  return nodemailer
    .createTransport(settings.smtpUrl, {
      connectionTimeout: SEND_TIMEOUT_IN_MS,
      greetingTimeout: SEND_TIMEOUT_IN_MS,
      socketTimeout: SEND_TIMEOUT_IN_MS,
    })
    .sendMail({ from: settings.from, to: mail.to, subject: mail.subject, text: mail.text })
    .then(
      () => true,
      (error: Error) => {
        console.warn("Mail could not be sent: " + error.message)

        return false
      },
    )
}
