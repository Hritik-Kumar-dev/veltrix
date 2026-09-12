import StackSpread from "./components/ui/stack-spread";
import "./landing.css";

export default function Landing() {
  return (
    <div className="landing-root">
      <main>
        <StackSpread
          bgColor="#050508"
          cardRadius={12}
          stackScale={0.82}
          textFadeStart={0.28}
        />
      </main>
    </div>
  );
}
