import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="text-center">
      <h1 className="num text-5xl font-bold text-gold">404</h1>
      <p className="micro mt-3">Instrument not found on this terminal</p>
      <Link to="/" className="mt-6 inline-block font-mono text-xs uppercase tracking-wider text-gold hover:underline">
        ← Back to the scanner
      </Link>
    </div>
  </div>
);

export default NotFound;
