const ConcentricLoader = () => {
  return (
    <div className="flex w-full min-h-[100svh] flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 animate-spin items-center justify-center rounded-full border-4 border-transparent border-t-green-400 text-4xl text-green-400">
        <div className="flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-transparent border-t-gray-400 text-2xl text-gray-400"></div>
      </div>
    </div>
  );
};

export default ConcentricLoader;
