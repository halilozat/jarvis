import {
  AlarmClock, Atom, BookOpen, Briefcase, Calendar, Car, Clock, Cloud, CloudRain, Coffee, Cpu, Film, FlaskConical, Globe,
  GraduationCap, Hand, HeartPulse, Info, Landmark, Lightbulb, MapPin, MessageCircle, Moon, Music, Newspaper, Plane, Rocket,
  Shield, Smile, Sparkles, Star, Sun, Thermometer, TrendingDown, TrendingUp, Trophy, Users, Utensils, Wallet, Zap,
  type LucideIcon,
} from 'lucide-react';

// Modelin seçebileceği sabit liste (server/src/prompt.ts ile aynı). Listede olmayan ad → sparkles.
const ICONS: Record<string, LucideIcon> = {
  sun: Sun, cloud: Cloud, 'cloud-rain': CloudRain, moon: Moon, thermometer: Thermometer,
  'trending-up': TrendingUp, 'trending-down': TrendingDown, wallet: Wallet, landmark: Landmark, globe: Globe,
  newspaper: Newspaper, cpu: Cpu, rocket: Rocket, atom: Atom, 'flask-conical': FlaskConical, 'heart-pulse': HeartPulse,
  trophy: Trophy, 'book-open': BookOpen, music: Music, film: Film, car: Car, plane: Plane, coffee: Coffee,
  utensils: Utensils, 'alarm-clock': AlarmClock, clock: Clock, calendar: Calendar, 'map-pin': MapPin,
  lightbulb: Lightbulb, shield: Shield, zap: Zap, users: Users, briefcase: Briefcase, 'graduation-cap': GraduationCap,
  hand: Hand, smile: Smile, star: Star, info: Info, 'message-circle': MessageCircle, sparkles: Sparkles,
};

export function Icon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name.trim().toLowerCase()] ?? Sparkles;
  return <C size={size} strokeWidth={1.6} className={className} aria-hidden="true" />;
}
