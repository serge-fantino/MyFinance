import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../hooks/useAuth";
import { loginSchema, type LoginForm } from "../../utils/validators";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { AxiosError } from "axios";

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(data);
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(err.response.data.detail);
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

      {/* Right side — login form */}
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
              <CardTitle>Connexion</CardTitle>
              <CardDescription>
                Connectez-vous pour acceder a vos comptes
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4">
                {error && <Alert variant="destructive">{error}</Alert>}

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
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                  error={errors.password?.message}
                  {...register("password")}
                />
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
                  Se connecter
                </Button>

                <p className="text-sm text-muted-foreground text-center">
                  Pas encore de compte ?{" "}
                  <Link to="/register" className="text-primary font-medium hover:underline">
                    Creer un compte
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
