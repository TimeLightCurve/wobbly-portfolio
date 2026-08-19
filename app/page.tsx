import { ThreeCanvas } from "@/components/ThreeCanvas"

export default function Home() {
  return (
    <div className="flex flex-col w-screen min-h-screen  bg-zinc-800 font-nian ">
      <main className="flex  w-full flex-col ">
        <ThreeCanvas />
      </main>
    </div>
  );
}
