'use client';

import { useEffect, useMemo, useState } from 'react';
import { OriginalFooter, OriginalHeader } from '../app/original-shell';
import type { LocalizedNews } from '../lib/content-repository';
import type { Locale } from '../lib/locales';
import { localizedPath } from '../lib/localized-route';
import type { ChromePayload, HomePayload } from '../lib/translation-types';

/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- The reproduced public homepage retains native anchors, original asset dimensions, and layout classes to preserve source fidelity. */

const heroImages = [
  [
    '7ad461d02fa445546a8567d1c8293e3b.png',
    'd714bdbb203af483c6cbbf4ebe90ba83.png',
  ],
  [
    'af0039c7a213a8374289c273de51f4f8.png',
    '951780546b18659f46dcd675d14e19d3.png',
  ],
] as const;

type PublicHomeProps = {
  locale: Locale;
  home: HomePayload;
  chrome: ChromePayload;
  news: LocalizedNews[];
  pathname?: string;
};

function productHref(locale: Locale, kind: 'industry' | 'brand', id: string) {
  return localizedPath(locale, '/catalog', `?type=${kind}&id=${id}`);
}

export function PublicHome({
  locale,
  home,
  chrome,
  news,
  pathname,
}: PublicHomeProps) {
  const [slide, setSlide] = useState(0);
  const [agencyStart, setAgencyStart] = useState(0);
  const [agencyVisible, setAgencyVisible] = useState(4);

  useEffect(() => {
    const heroTimer = window.setInterval(
      () => setSlide((current) => (current + 1) % heroImages.length),
      5000,
    );
    const agencyTimer = window.setInterval(
      () =>
        setAgencyStart(
          (current) => (current + 1) % home.literals.agencyIds.length,
        ),
      3000,
    );
    const resize = () =>
      setAgencyVisible(
        window.innerWidth < 768
          ? 1
          : window.innerWidth < 992
            ? 2
            : window.innerWidth < 1200
              ? 3
              : 4,
      );
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.clearInterval(heroTimer);
      window.clearInterval(agencyTimer);
      window.removeEventListener('resize', resize);
    };
  }, [home.literals.agencyIds.length]);

  const visibleAgencies = useMemo(
    () =>
      Array.from(
        { length: agencyVisible },
        (_, index) => (agencyStart + index) % home.literals.agencyIds.length,
      ),
    [agencyStart, agencyVisible, home.literals.agencyIds.length],
  );
  const moveAgency = (amount: number) =>
    setAgencyStart(
      (current) =>
        (current + amount + home.literals.agencyIds.length) %
        home.literals.agencyIds.length,
    );
  const featuredNews = home.literals.newsIds.flatMap((legacyId) => {
    const item = news.find((candidate) => candidate.legacyId === legacyId);
    return item ? [item] : [];
  });

  return (
    <main id="top" className="original-home">
      <OriginalHeader locale={locale} chrome={chrome} pathname={pathname} />
      <section className="original-hero" aria-label={home.text.hero}>
        {heroImages.map(([desktop, mobile], index) => (
          <a
            href={localizedPath(locale, '/')}
            className={`original-hero-slide ${slide === index ? 'active' : ''}`}
            aria-hidden={slide !== index}
            key={desktop}
          >
            <picture>
              <source
                media="(max-width:768px)"
                srcSet={`/reference/original/${mobile}`}
              />
              <img
                src={`/reference/original/${desktop}`}
                alt={`banner-0${index + 1}`}
              />
            </picture>
          </a>
        ))}
        <button
          type="button"
          className="original-hero-arrow prev"
          onClick={() =>
            setSlide((current) => (current + 1) % heroImages.length)
          }
          aria-label={home.text.previousSlide}
        >
          <i className="original-fa original-fa-play" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="original-hero-arrow next"
          onClick={() =>
            setSlide((current) => (current + 1) % heroImages.length)
          }
          aria-label={home.text.nextSlide}
        >
          <i className="original-fa original-fa-play" aria-hidden="true" />
        </button>
        <a className="original-scroll" href="#scroll">
          <img
            src="/reference/original/scrollDown_mouse.svg"
            alt={home.text.scrollDown}
          />
        </a>
      </section>
      <div id="scroll">
        <section className="original-about">
          <div className="original-about-inner">
            <article>
              <div className="original-about-title">
                <span>{home.text.eyebrow}</span>
                <small>{home.text.introduction}</small>
              </div>
              <h2>{home.text.heading}</h2>
              <ul>
                {home.text.services.map((service) => (
                  <li key={service}>
                    {service.split('\n').map((line, index) => (
                      <span key={line}>
                        {index > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </article>
            <div className="original-about-image">
              <img
                src="/reference/original/indexAbout.png"
                alt={home.text.aboutImage}
              />
            </div>
          </div>
        </section>
        <section className="original-features" aria-label={home.text.industry}>
          {home.literals.featureIds.map((id, index) => (
            <article className="original-feature" key={id}>
              <img src={home.literals.featureImages[index]} alt="" />
              <div className="original-feature-overlay">
                <div className="original-feature-border">
                  <div>
                    <h2>{home.text.featureLabels[index]}</h2>
                    <div className="original-feature-linkbox">
                      <span className="original-feature-line">
                        <img src="/reference/original/arrowR.png" alt="" />
                      </span>
                      <a href={productHref(locale, 'industry', id)}>
                        {home.text.readMore}{' '}
                        <img src="/reference/original/addWhite.png" alt="" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
        <section className="original-agency" id="brands">
          <div className="original-container">
            <div className="original-section-title">
              <span>{home.text.brandEyebrow}</span>
              <small>{home.text.brands}</small>
            </div>
            <div className="original-agency-carousel">
              <button
                type="button"
                onClick={() => moveAgency(-1)}
                aria-label={home.text.previousBrands}
              >
                <i
                  className="original-fa original-fa-play"
                  aria-hidden="true"
                />
              </button>
              <div className="original-agency-list">
                {visibleAgencies.map((index) => (
                  <article
                    key={`${agencyStart}-${home.literals.agencyIds[index]}`}
                  >
                    <a
                      href={productHref(
                        locale,
                        'brand',
                        home.literals.agencyIds[index],
                      )}
                    >
                      <img
                        src={home.literals.agencyImages[index]}
                        alt={home.text.agencyLabels[index]}
                      />
                    </a>
                    <h3>{home.text.agencyLabels[index]}</h3>
                  </article>
                ))}
              </div>
              <button
                type="button"
                onClick={() => moveAgency(1)}
                aria-label={home.text.nextBrands}
              >
                <i
                  className="original-fa original-fa-play"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </section>
        <section className="original-news" id="news">
          <div className="original-container">
            <div className="original-section-title">
              <span>{home.text.newsEyebrow}</span>
              <small>{home.text.news}</small>
            </div>
            <div className="original-news-grid">
              {featuredNews.map((item) => (
                <article className="original-news-item" key={item.id}>
                  <a
                    className="original-news-image"
                    href={localizedPath(
                      locale,
                      '/news',
                      `?id=${item.legacyId}`,
                    )}
                  >
                    <img src={item.imageUrl} alt={item.title} />
                  </a>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.lead}</p>
                    <a
                      className="original-news-more"
                      href={localizedPath(
                        locale,
                        '/news',
                        `?id=${item.legacyId}`,
                      )}
                    >
                      {home.text.more}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
      <OriginalFooter locale={locale} chrome={chrome} />
    </main>
  );
}
