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
        <h1>
          <span>WTrack</span>
        </h1>
      </div>
    </section>
  );
};
