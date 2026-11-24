import { Link } from 'react-router-dom';
import { MapPin, ListOrdered, Ruler, BellRing, Route as RouteIcon, Siren, Lock, EyeOff, Smartphone, Share2, Navigation, ArrowRight, ShieldCheck, Zap, UserRoundX, CheckCircle2 } from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import PhoneMock from '../components/PhoneMock.jsx';
import { loadSession, lastJourneyId } from '../session.js';

const steps = [
  { Icon: Share2, title: 'Start a journey', text: 'Add your route and vehicle. Get a code, link and QR code to share.' },
  { Icon: Smartphone, title: 'Everyone joins', text: 'Scan, tap the link or type the code. No sign-up.' },
  { Icon: Navigation, title: 'Travel together', text: 'See every vehicle, who’s ahead and who needs the group to wait.' },
];

const small = [
  { Icon: Ruler, title: 'Distance between vehicles', text: 'The gap to the car ahead and behind you, along the road and in a straight line.' },
  { Icon: BellRing, title: 'Falling-behind alerts', text: 'Set a maximum gap. The group is told when someone passes it.' },
  { Icon: RouteIcon, title: 'Wrong-turn alerts', text: 'Know when a vehicle leaves the route, with its last known spot.' },
  { Icon: Siren, title: 'SOS to the group', text: 'One confirmed tap sends your latest location to everyone.' },
];

export default function Landing() {
  const resumeId = lastJourneyId();
  const canResume = resumeId && loadSession(resumeId);
  return (
    <div id="top">
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 md:grid-cols-[1.15fr_.85fr] md:pb-20 md:pt-16">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink-soft">
                <span className="dot-live h-1.5 w-1.5 rounded-full bg-teal text-teal" />Live group tracking · no app needed
              </p>
              <h1 className="mt-4 text-[34px] font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
                Every Vehicle Together. <span className="text-teal">Every Journey Connected.</span>
              </h1>
              <p className="mt-4 max-w-[34rem] text-base text-ink-soft sm:text-lg">
                Travel together without losing track of each other. See every vehicle, track your group, and stay connected throughout your journey.
              </p>
              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                <Link to="/create" className="btn-primary min-h-[50px] px-6 text-base">Start a Journey <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                <Link to="/join" className="btn-secondary min-h-[50px] px-6 text-base">Join a Journey</Link>
              </div>
              {canResume && <p className="mt-3"><Link to={`/journey/${resumeId}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-dark underline underline-offset-4">Return to your journey</Link></p>}
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-soft">
                {['Works in any browser', 'Free to use', 'No sign-up'].map((t) => <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-teal" aria-hidden="true" />{t}</li>)}
              </ul>
            </div>
            <PhoneMock />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-bold sm:text-3xl">How it works</h2>
            <ol className="mt-6 grid gap-3 md:grid-cols-3">
              {steps.map(({ Icon, title, text }, i) => (
                <li key={title} className="card relative overflow-hidden p-5">
                  <span className="absolute -right-1 -top-4 select-none text-[84px] font-extrabold leading-none text-ink/[.05]" aria-hidden="true">{i + 1}</span>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-light text-teal-dark"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 text-lg font-bold"><span className="sr-only">Step {i + 1}: </span>{title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 pb-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-bold sm:text-3xl">Built for the questions every convoy asks</h2>
            <p className="mt-1.5 text-ink-soft">Who’s ahead? Who’s behind? Did someone take a different road?</p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <article className="card p-5 md:col-span-2">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-light text-teal-dark"><ListOrdered className="h-5 w-5" aria-hidden="true" /></span>
                    <h3 className="mt-4 text-lg font-bold">Automatic vehicle order</h3>
                    <p className="mt-1 text-sm text-ink-soft">Measured along your route, not by map coordinates, so winding roads and parallel streets don’t confuse it.</p>
                  </div>
                  <ul className="space-y-2 self-center" aria-label="Example vehicle order">
                    {[['A', '#1F7A72', 'Car A', 'Leading'], ['B', '#D1495B', 'Car B', '2.4 km behind'], ['C', '#E3A72F', 'Car C', '5.1 km behind'], ['D', '#3D5A80', 'Bike D', '7.3 km behind']].map(([l, c, n, g]) => (
                      <li key={l} className="flex items-center gap-2.5 rounded-xl bg-paper px-3 py-2 text-sm">
                        <span className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: c }}>{l}</span>
                        <b className="flex-1">{n}</b><span className={l === 'A' ? 'font-semibold text-teal-dark' : 'text-ink-soft'}>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
              <article className="card p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-light text-teal-dark"><MapPin className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-4 text-lg font-bold">Live shared map</h3>
                <p className="mt-1 text-sm text-ink-soft">Every vehicle with its own icon, colour and name, updating on its own.</p>
              </article>
              {small.map(({ Icon, title, text }) => (
                <article key={title} className="card p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-light text-teal-dark"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 text-base font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Why */}
        <section id="about" className="scroll-mt-20 bg-ink py-14 text-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-2 md:gap-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Why not just share a pin in a chat app?</h2>
            <div className="space-y-3 text-white/75">
              <p>A chat pin shows where someone was. It doesn’t tell you who is first, how far behind the last car is, or when someone leaves the route.</p>
              <p>Convoy follows your group along one planned route, so “where is everyone?” becomes a single glance, even for people who rarely use apps.</p>
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-20 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-bold sm:text-3xl">Safety and privacy</h2>
            <ul className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { Icon: EyeOff, t: 'You choose when to share', d: 'Your browser asks first. A clear banner shows while sharing is on, and you can stop any time.' },
                { Icon: Lock, t: 'Only your group can see you', d: 'Locations are visible only to people who joined with your code. The leader can remove anyone.' },
                { Icon: ShieldCheck, t: 'Honest about limits', d: 'If a phone stops reporting, Convoy marks the position as out of date instead of showing it as live.' },
              ].map(({ Icon, t, d }) => (
                <li key={t} className="card p-5">
                  <Icon className="h-5 w-5 text-teal" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-bold">{t}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{d}</p>
                </li>
              ))}
            </ul>
            <p className="mt-5 max-w-3xl text-xs text-ink-soft">SOS alerts your travelling group over the internet. It does not contact police, ambulance or any emergency service. In an emergency, call your local emergency number.</p>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-14">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 rounded-3xl bg-teal px-6 py-9 text-white sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="text-2xl font-bold">Ready to travel together?</h2>
              <p className="mt-1 text-white/80">Create a journey in under a minute.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link to="/create" className="btn min-h-[48px] bg-white px-5 text-teal-dark hover:bg-paper">Start a Journey</Link>
              <Link to="/join" className="btn min-h-[48px] border border-white/40 px-5 text-white hover:bg-white/10">Join a Journey</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
