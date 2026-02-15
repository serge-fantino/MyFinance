/**
 * LoginPage — landing page for unauthenticated users.
 *
 * With Keycloak, there's no local login form. This page shows branding
 * and a button to redirect to Keycloak's login UI (which supports
 * email/password, MFA, social login, passkeys, etc.).
 */
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/Card";

export default function LoginPage() {
  const { login, register } = useAuth();

  return (
    <div className="min-h-screen flex">
      {/* Left side — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-indigo-800" />
        <div className="relative z-10 flex flex-col justify-center px-16 text-primary-foreground">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm mb-6">
              <span className="text-3xl font-bold">MF</span>
            </div>
            <h1 className="text-4xl font-bold mb-4">MyFinance</h1>
            <p className="text-xl text-white/80 leading-relaxed">
              Gerez vos finances personnelles avec l'aide de l'intelligence artificielle.
              Vue consolidee, analyse des depenses, et assistant IA.
            </p>
          </div>
          <div className="space-y-4 text-white/70">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm">1</div>
              <span>Importez vos releves bancaires</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm">2</div>
              <span>L'IA classe automatiquement vos depenses</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm">3</div>
              <span>Visualisez et pilotez votre budget</span>
            </div>
          </div>
        </div>
        {/* Decorative circles */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5" />
      </div>

      {/* Right side — auth actions */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-4">
              <span className="text-2xl font-bold">MF</span>
            </div>
            <h1 className="text-2xl font-bold">MyFinance</h1>
          </div>

          <Card>
            <CardHeader className="text-center">
              <CardTitle>Bienvenue sur MyFinance</CardTitle>
              <CardDescription>
                Connectez-vous pour acceder a vos comptes.
                Authentification securisee avec MFA, passkey et SSO.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Authentification multi-facteurs (MFA)</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span>Passkey et cle de securite</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                  <span>Connexion via Google, GitHub, etc. (SSO)</span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button onClick={login} className="w-full" size="lg">
                Se connecter
              </Button>
              <Button onClick={register} variant="outline" className="w-full" size="lg">
                Creer un compte
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
