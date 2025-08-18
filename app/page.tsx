import dynamic from "next/dynamic";

const ThreeScreen = dynamic(() => import("@/component/three"));

export default function Home() {
  return <ThreeScreen />;
}
