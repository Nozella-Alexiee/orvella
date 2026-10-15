import {
  AlarmClock, ArrowDownUp, ArrowLeft, ArrowRight, Award, BarChart3, Bell, Blocks, BookOpen, Bot, Box, Briefcase, Building2, Bug, Calculator,
  Check, ChevronDown, ChevronRight, ChevronsRight, Chrome, Circle, CircleAlert, CircleArrowRight, CircleCheck, CircleHelp, CircleX, Clapperboard,
  ClipboardCheck, ClipboardPlus, Clock, CloudCheck, CodeXml, Copy, CreditCard, Download, Dumbbell, Eye, ExternalLink, FileDown, Flag, FlaskConical,
  FolderKanban, Gamepad2, GitBranch, GraduationCap, GripVertical, Hand, Hourglass, House, Info, Layers, LayoutDashboard, LayoutGrid, LayoutList,
  Lightbulb, Link, List, ListChecks, Loader, LoaderCircle, Lock, LockOpen, LogOut, Map, MessageCircle, MessageSquare, MessageSquareCode, Monitor,
  Notebook, NotebookPen, Pause, Pencil, Play, Plus, Diff, Puzzle, Quote, Repeat, RotateCcw, Save, School, Search, Send, Settings, Shapes,
  Shield, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, SquareFunction, Stethoscope, SunMoon, Swords, Target, Terminal, Text, Timer,
  Trash2, TriangleAlert, Type, Upload, User, UserPlus, Users, WifiOff, Wind, X, Zap, type LucideIcon,
  Activity, ArrowDown, ArrowUp, ArrowUpRight, AtSign, BadgeCheck, Braces, Calendar, CalendarClock, CheckCheck, ChevronLeft, CircleDot, CirclePlay, ClipboardPaste, Columns2, Cpu, Crown, Database, EyeOff, File, FileCode, FilePlus, FileText, FileX, Film, Folder, FolderOpen, FolderPlus, Gauge, GitCompare, Globe, Hammer, Heading, History, Image, Import, Inbox, Keyboard, Link2, ListOrdered, Maximize2, Medal, MemoryStick, MessagesSquare, Minus, PanelLeft, PanelRight, PenLine, Pin, Power, Presentation, Printer, QrCode, Radio, RefreshCw, Reply, Rocket, Server, Share2, ShieldAlert, Square, Star, Table, Tablet, Trophy, Tv, Undo2, Video, WandSparkles, Wrench, Youtube, Scan, Minimize, LogIn, Moon, Music, StickyNote, Heart, Sun, PartyPopper,
  PictureInPicture2, AppWindow, Minimize2, MessageCircleQuestion, ThumbsUp, ThumbsDown, CornerDownRight,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'alarm-clock': AlarmClock, 'arrow-down-up': ArrowDownUp, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, award: Award,
  'chart-no-axes-column': BarChart3, bell: Bell, blocks: Blocks, 'book-open': BookOpen, bot: Bot, box: Box, briefcase: Briefcase,
  'building-2': Building2, bug: Bug, calculator: Calculator, check: Check, 'chevron-down': ChevronDown, 'chevron-right': ChevronRight,
  'chevrons-right': ChevronsRight, chrome: Chrome, circle: Circle, 'circle-alert': CircleAlert, 'arrow-right-circle': CircleArrowRight,
  'circle-check': CircleCheck, 'help-circle': CircleHelp, 'circle-x': CircleX, clapperboard: Clapperboard, 'clipboard-check': ClipboardCheck,
  'clipboard-plus': ClipboardPlus, clock: Clock, 'cloud-check': CloudCheck, 'code-xml': CodeXml, copy: Copy, 'credit-card': CreditCard,
  download: Download, dumbbell: Dumbbell, eye: Eye, 'external-link': ExternalLink, 'file-down': FileDown, flag: Flag, 'flask-conical': FlaskConical,
  'folder-kanban': FolderKanban, 'gamepad-2': Gamepad2, 'git-branch': GitBranch, 'graduation-cap': GraduationCap, 'grip-vertical': GripVertical,
  hand: Hand, hourglass: Hourglass, house: House, info: Info, layers: Layers, 'layout-dashboard': LayoutDashboard, 'layout-grid': LayoutGrid,
  'layout-list': LayoutList, lightbulb: Lightbulb, link: Link, list: List, 'list-checks': ListChecks, loader: Loader, 'loader-circle': LoaderCircle,
  lock: Lock, 'lock-open': LockOpen, 'log-out': LogOut, map: Map, 'message-circle': MessageCircle, 'message-square': MessageSquare,
  'message-square-code': MessageSquareCode, monitor: Monitor, notebook: Notebook, 'notebook-pen': NotebookPen, pause: Pause, pencil: Pencil,
  play: Play, plus: Plus, 'plus-minus': Diff, puzzle: Puzzle, quote: Quote, repeat: Repeat, 'rotate-ccw': RotateCcw, save: Save,
  school: School, search: Search, send: Send, settings: Settings, shapes: Shapes, shield: Shield, 'shield-check': ShieldCheck,
  'sliders-horizontal': SlidersHorizontal, smartphone: Smartphone, sparkles: Sparkles, 'function-square': SquareFunction, stethoscope: Stethoscope,
  'sun-moon': SunMoon, swords: Swords, target: Target, terminal: Terminal, text: Text, timer: Timer, 'trash-2': Trash2, 'triangle-alert': TriangleAlert,
  type: Type, upload: Upload, user: User, 'user-plus': UserPlus, users: Users, 'wifi-off': WifiOff, wind: Wind, x: X, zap: Zap,
  'picture-in-picture-2': PictureInPicture2, 'app-window': AppWindow, 'minimize-2': Minimize2, 'message-circle-question': MessageCircleQuestion,
  'thumbs-up': ThumbsUp, 'thumbs-down': ThumbsDown, 'corner-down-right': CornerDownRight,
  'square': Square, 'refresh-cw': RefreshCw, 'globe': Globe, 'database': Database, 'folder': Folder, 'file': File, 'file-plus': FilePlus, 'cpu': Cpu, 'hammer': Hammer, 'memory-stick': MemoryStick, 'keyboard': Keyboard, 'panel-left': PanelLeft, 'chevron-left': ChevronLeft, 'tablet': Tablet, 'maximize-2': Maximize2, 'power': Power, 'server': Server, 'folder-open': FolderOpen, 'file-code': FileCode, 'video': Video, 'tv': Tv, 'qr-code': QrCode, 'radio': Radio, 'trophy': Trophy, 'medal': Medal, 'share-2': Share2, 'printer': Printer, 'messages-square': MessagesSquare, 'check-check': CheckCheck, 'git-compare': GitCompare, 'badge-check': BadgeCheck, 'wand-sparkles': WandSparkles, 'circle-play': CirclePlay, 'youtube': Youtube, 'list-ordered': ListOrdered, 'table': Table, 'heading': Heading, 'image': Image, 'film': Film, 'clipboard-paste': ClipboardPaste, 'import': Import, 'history': History, 'presentation': Presentation, 'crown': Crown, 'rocket': Rocket, 'wrench': Wrench, 'circle-dot': CircleDot, 'panel-right': PanelRight, 'columns-2': Columns2, 'arrow-up-right': ArrowUpRight, 'minus': Minus, 'undo-2': Undo2, 'folder-plus': FolderPlus, 'file-x': FileX, 'star': Star, 'inbox': Inbox, 'reply': Reply, 'at-sign': AtSign, 'link-2': Link2, 'shield-alert': ShieldAlert, 'activity': Activity, 'gauge': Gauge, 'arrow-up': ArrowUp, 'arrow-down': ArrowDown, 'pin': Pin, 'eye-off': EyeOff, 'calendar-clock': CalendarClock, 'calendar': Calendar, 'file-text': FileText, 'pen-line': PenLine, 'braces': Braces, 'scan': Scan, 'minimize': Minimize, 'log-in': LogIn, 'moon': Moon, 'music': Music, 'sticky-note': StickyNote, 'heart': Heart, 'sun': Sun, 'party-popper': PartyPopper,
};

/** Ikon app Orvi AI: wajah Orvi (planet bercincin, mata, senyum) dengan kilau AI di pojok. Gaya garis sama dengan Lucide. */
const OrviAi = (({ className, style, strokeWidth = 1.75, ...rest }: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" className={className} style={style} {...rest}>
    <circle cx="11" cy="13" r="6.5" />
    <path d="M5.2 10.6C2.6 11.7 1.3 13 1.8 14c.9 1.7 6.3 1.6 11.6-.2 5.3-1.8 8.6-4.3 7.7-6-.4-.8-1.7-1.1-3.5-.9" />
    <path d="M8.9 12.4v.6M13.1 12.4v.6" />
    <path d="M9 15.6c1.1.9 2.9.9 4 0" />
    <path d="M19.5 1.8v3.4M17.8 3.5h3.4" />
  </svg>
)) as unknown as LucideIcon;
ICONS['orvi-ai'] = OrviAi;

export const iconNames = Object.keys(ICONS);

type Props = { name: string; size?: 14 | 20; className?: string; style?: React.CSSProperties; title?: string };

/** Lucide icon by its kebab-case name (the names used in the mockups and in content). */
export function Icon({ name, size, className, style, title }: Props) {
  const C = ICONS[name] || Circle;
  const cls = ['lucide', size ? `i-${size}` : '', className || ''].filter(Boolean).join(' ');
  return <C className={cls} style={style} aria-hidden={title ? undefined : true} aria-label={title} strokeWidth={1.75} />;
}
