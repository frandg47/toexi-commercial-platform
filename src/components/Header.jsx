import BackgroundHeader from "/toexiHeader.jpg"

const Header = () => (
  <header className="relative h-16 w-full flex items-center shadow-md overflow-hidden">
    <img
      src={BackgroundHeader}
      alt="Logo"
      className="absolute inset-0 w-full h-full object-cover object-center scale-160"
    />
    <div className="relative z-10 flex items-center w-full px-4">
      {/* Puedes agregar aquí el título u otros elementos si lo deseas */}
    </div>
  </header>
);

export default Header;