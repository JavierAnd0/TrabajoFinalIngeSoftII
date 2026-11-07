import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('edudistribuida_token', { path: '/' });
  cookies.delete('edudistribuida_user', { path: '/' });
  return redirect('/login');
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('edudistribuida_token', { path: '/' });
  cookies.delete('edudistribuida_user', { path: '/' });
  return redirect('/login');
};
