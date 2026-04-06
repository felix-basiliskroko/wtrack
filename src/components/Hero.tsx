import { motion } from 'framer-motion';

export const Hero = () => {
  return (
    <section className="hero">
      <motion.div
        className="hero-orb"
        animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.65, 0.9, 0.65] }}
        transition={{ repeat: Infinity, duration: 12, ease: 'easeInOut' }}
      />
      <div className="hero-copy">
        <p className="eyebrow">AI infused weight intelligence</p>
        <h1>
          <span>WTrack</span>
          <small>Metabolic twin tuned by your cardio</small>
        </h1>
        <p className="muted">
          Every weigh-in plus heart rate trace updates a metabolic simulation of your body so the curves you
          see mirror human physiology, not fantasy math.
        </p>
      </div>
    </section>
  );
};
