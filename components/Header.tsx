import Link from "next/link";
import Logo from "./reusables/Logo";
import PrimaryButton from "./reusables/primaryButton";
import SecondaryButton from "./reusables/secondaryButton";

export default function Header() {
    return (
        <header className="flex justify-between items-center border-b border-border py-4 px-8 bg-white m-4 rounded-lg border shadow-sm">
            <div className="flex items-center gap-12">
                <Link href="/" className="hover:opacity-90 transition-opacity">
                    <Logo markSize={32} textSize={18} />
                </Link>
                <nav className="hidden md:flex">
                    <ul className="flex gap-8 text-[15px] font-medium text-slate">
                        <li>
                            <Link href="#" className="hover:text-blue transition-colors">Features</Link>
                        </li>
                        <li>
                            <Link href="#" className="hover:text-blue transition-colors">Solutions</Link>
                        </li>
                        <li>
                            <Link href="#" className="hover:text-blue transition-colors">Templates</Link>
                        </li>
                        <li>
                            <Link href="#" className="hover:text-blue transition-colors">Pricing</Link>
                        </li>
                        <li>
                            <Link href="#" className="hover:text-blue transition-colors">Resources</Link>
                        </li>
                    </ul>
                </nav>
            </div>
            <div className="flex items-center gap-4">
                <SecondaryButton size="sm">Button</SecondaryButton>
                <PrimaryButton size="sm">Button</PrimaryButton>
            </div>
        </header>
    );
}
