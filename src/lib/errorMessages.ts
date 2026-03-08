/**
 * Maps database/auth error codes to user-friendly Portuguese messages.
 * Prevents leaking internal schema details to the client.
 */
export function getErrorMessage(err: any, context: 'auth' | 'db' = 'db'): string {
  // Auth errors from Supabase are generally safe, but sanitize anyway
  if (context === 'auth') {
    const msg = err?.message?.toLowerCase?.() || '';
    if (msg.includes('invalid login')) return 'E-mail ou senha incorretos.';
    if (msg.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
    if (msg.includes('user already registered')) return 'Este e-mail já está cadastrado.';
    if (msg.includes('password')) return 'A senha não atende aos requisitos mínimos.';
    if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde um momento.';
    return 'Erro ao autenticar. Tente novamente.';
  }

  // Database errors
  const code = err?.code;
  if (code === '23505') return 'Você já realizou esta ação.';
  if (code === '23503') return 'Dados referenciados não encontrados.';
  if (code === '42501') return 'Operação não permitida.';
  if (code === '23514') return 'Dados inválidos. Verifique os campos.';
  
  return 'Ocorreu um erro. Tente novamente.';
}
