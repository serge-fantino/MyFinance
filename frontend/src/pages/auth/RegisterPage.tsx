import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../hooks/useAuth";
import { registerSchema, type RegisterForm } from "../../utils/validators";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { AxiosError } from "axios";

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await registerUser(data);
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === "string") {
          setError(detail);
        } else if (Array.isArray(detail)) {
          // Pydantic validation errors
          setError(detail.map((d: { msg: string }) => d.msg).join(". "));
        } else {
          setError("Une erreur est survenue.");
        }
      } else {
        setError("Une erreur est survenue. Veuillez reessayer.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <h1 className="text-4xl font-bold mb-4">Bienvenue sur MyFinance</h1>
            <p className="text-xl text-white/80 leading-relaxed">
              Creez votre compte gratuitement et commencez a mieux comprendre vos finances.
            </p>
          </div>
          <div className="space-y-4 text-white/70">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Multi-comptes bancaires</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Classification IA automatique</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Tableaux de bord et previsions</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Assistant IA conversationnel</span>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5" />
      </div>

      {/* Right side — register form */}
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
              <CardTitle>Creer un compte</CardTitle>
              <CardDescription>
                Inscrivez-vous pour commencer a gerer vos finances
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4">
                {error && <Alert variant="destructive">{error}</Alert>}

                <Input
                  id="full_name"
                  label="Nom complet"
                  type="text"
                  placeholder="Jean Dupont"
                  autoComplete="name"
                  error={errors.full_name?.message}
                  {...register("full_name")}
                />

                <Input
                  id="email"
                  label="Email"
                  type="email"
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                  error={errors.email?.message}
                  {...register("email")}
                />

                <Input
                  id="password"
                  label="Mot de passe"
                  type="password"
                  placeholder="Min. 8 caracteres, 1 majuscule, 1 chiffre"
                  autoComplete="new-password"
                  error={errors.password?.message}
                  {...register("password")}
                />

                <p className="text-xs text-muted-foreground">
                  Le mot de passe doit contenir au moins 8 caracteres, une majuscule et un chiffre.
                </p>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
                  Creer mon compte
                </Button>

                <p className="text-sm text-muted-foreground text-center">
                  Deja un compte ?{" "}
                  <Link to="/login" className="text-primary font-medium hover:underline">
                    Se connecter
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
