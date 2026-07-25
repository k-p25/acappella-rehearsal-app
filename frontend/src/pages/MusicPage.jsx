import Navbar from '../components/Navbar';

export default function MusicPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">Music</h1>
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <p className="text-sm text-slate-400">Music library is coming soon.</p>
        </div>
      </main>
    </div>
  );
}
