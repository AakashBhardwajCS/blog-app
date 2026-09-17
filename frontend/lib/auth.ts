export const authChangeEvent = 'blog-auth-change';

export function notifyAuthChange(): void {
  window.dispatchEvent(new Event(authChangeEvent));
}
