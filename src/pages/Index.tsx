import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-primary">
      <div className="text-center animate-fade-in">
        <h1 className="mb-2 text-4xl font-bold text-primary-foreground">Aiders Global</h1>
        <p className="text-lg text-primary-foreground/70 mb-8">Loan Management System</p>
        <Button
          onClick={() => navigate("/")}
          className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold px-8"
        >
          Sign In
        </Button>
      </div>
    </div>
  );
};

export default Index;
